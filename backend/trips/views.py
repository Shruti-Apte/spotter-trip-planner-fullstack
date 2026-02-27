import json
from datetime import datetime
from math import hypot

from django.conf import settings
from django.http import JsonResponse
from django.utils import timezone
from django.views import View
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.utils.decorators import method_decorator

from .log_sheet_generator import build_log_sheets
from .mapbox_client import get_route, search_places
from .schemas import DutyStatus, TripRequest
from .serializers import (
    daily_log_to_dict,
    route_to_dict,
    timeline_segment_to_dict,
)
from .timeline_engine import build_timeline


def _parse_location_coords(value):
    if value is None:
        return None
    if not isinstance(value, (list, tuple)) or len(value) < 2:
        raise ValueError("location coordinates must be [lng, lat]")
    return [float(value[0]), float(value[1])]


def _point_along_geometry(geometry, progress: float):
    """Return [lng, lat] for a fractional progress (0..1) along route geometry."""
    if not geometry:
        return None
    if len(geometry) == 1:
        return geometry[0]

    progress = max(0.0, min(1.0, float(progress)))
    segment_lengths = []
    total_length = 0.0
    for i in range(1, len(geometry)):
        x0, y0 = geometry[i - 1]
        x1, y1 = geometry[i]
        seg_len = hypot(x1 - x0, y1 - y0)
        segment_lengths.append(seg_len)
        total_length += seg_len

    if total_length <= 0:
        return geometry[-1]

    target = total_length * progress
    walked = 0.0
    for i, seg_len in enumerate(segment_lengths, start=1):
        next_walked = walked + seg_len
        if next_walked >= target:
            if seg_len <= 0:
                return geometry[i]
            t = (target - walked) / seg_len
            x0, y0 = geometry[i - 1]
            x1, y1 = geometry[i]
            return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]
        walked = next_walked

    return geometry[-1]


def _build_stops_and_rests(timeline, route):
    """
    Serialize non-driving timeline segments and attach coordinates.
    Pickup/dropoff use waypoint coordinates; other stops use leg-level drive progress
    (current->pickup or pickup->dropoff) for better spatial precision.
    """
    leg_durations_min = [
        (leg.duration_hours or 0.0) * 60
        for leg in (route.legs or [])
    ]
    driven_leg_min = [0.0 for _ in leg_durations_min]
    active_leg = 0
    total_driving_min = sum(leg_durations_min)
    cumulative_driving_min = 0.0
    items = []

    for seg in timeline:
        if seg.status == DutyStatus.DRIVING:
            desc = (seg.description or "").lower()
            if "dropoff" in desc and len(driven_leg_min) > 1:
                active_leg = 1
            cumulative_driving_min += seg.duration_minutes
            if driven_leg_min:
                idx = min(active_leg, len(driven_leg_min) - 1)
                driven_leg_min[idx] += seg.duration_minutes
            continue

        item = timeline_segment_to_dict(seg)
        desc = (seg.description or "").lower()
        coord = None

        if "pickup" in desc and len(route.waypoints) >= 2:
            coord = route.waypoints[1]
            active_leg = 1
        elif "dropoff" in desc and len(route.waypoints) >= 3:
            coord = route.waypoints[2]
        elif route.legs and driven_leg_min:
            idx = min(active_leg, len(route.legs) - 1)
            leg = route.legs[idx]
            leg_total = leg_durations_min[idx] if idx < len(leg_durations_min) else 0.0
            if leg_total > 0:
                leg_progress = max(0.0, min(1.0, driven_leg_min[idx] / leg_total))
                if leg.geometry:
                    coord = _point_along_geometry(leg.geometry, leg_progress)
                elif route.geometry:
                    # If leg geometry is missing from directions payload, convert
                    # leg-local progress into full-route progress before interpolation.
                    mins_before_leg = sum(leg_durations_min[:idx])
                    global_progress = (
                        0.0
                        if total_driving_min <= 0
                        else (mins_before_leg + driven_leg_min[idx]) / total_driving_min
                    )
                    coord = _point_along_geometry(route.geometry, global_progress)
            elif route.geometry:
                progress = (
                    0.0
                    if total_driving_min <= 0
                    else cumulative_driving_min / total_driving_min
                )
                coord = _point_along_geometry(route.geometry, progress)
        elif route.geometry:
            progress = (
                0.0
                if total_driving_min <= 0
                else cumulative_driving_min / total_driving_min
            )
            coord = _point_along_geometry(route.geometry, progress)

        item["coordinates"] = coord
        items.append(item)

    return items


@method_decorator(csrf_exempt, name="dispatch")
@method_decorator(require_http_methods(["POST"]), name="dispatch")
class PlanTripView(View):
    """POST /api/plan/ – plan a trip and return route, stops, and log sheets."""

    def post(self, request):
        try:
            body = json.loads(request.body)
        except (json.JSONDecodeError, TypeError):
            return JsonResponse(
                {"error": "Invalid JSON"},
                status=400,
            )

        current_location = body.get("current_location", "").strip()
        pickup_location = body.get("pickup_location", "").strip()
        dropoff_location = body.get("dropoff_location", "").strip()
        current_cycle_used_hrs = body.get("current_cycle_used_hrs", 0)

        if not current_location or not pickup_location or not dropoff_location:
            return JsonResponse(
                {"error": "current_location, pickup_location, and dropoff_location are required"},
                status=400,
            )

        try:
            current_cycle_used_hrs = float(current_cycle_used_hrs)
            if current_cycle_used_hrs < 0 or current_cycle_used_hrs > 70:
                return JsonResponse(
                    {"error": "current_cycle_used_hrs must be between 0 and 70"},
                    status=400,
                )
        except (TypeError, ValueError):
            return JsonResponse(
                {"error": "current_cycle_used_hrs must be a number"},
                status=400,
            )

        try:
            current_location_coords = _parse_location_coords(
                body.get("current_location_coords")
            )
            pickup_location_coords = _parse_location_coords(
                body.get("pickup_location_coords")
            )
            dropoff_location_coords = _parse_location_coords(
                body.get("dropoff_location_coords")
            )
        except (TypeError, ValueError) as exc:
            return JsonResponse({"error": str(exc)}, status=400)

        start_time = body.get("start_time")
        if start_time is None:
            start_time = timezone.now()
            if timezone.get_current_timezone():
                start_time = start_time.astimezone(timezone.get_current_timezone())
        else:
            try:
                if isinstance(start_time, str):
                    start_time = datetime.fromisoformat(
                        start_time.replace("Z", "+00:00")
                    )
                if timezone.get_current_timezone() and start_time.tzinfo is None:
                    start_time = timezone.make_aware(start_time)
            except (ValueError, TypeError):
                return JsonResponse(
                    {"error": "start_time must be an ISO datetime string"},
                    status=400,
                )

        trip_request = TripRequest(
            current_location=current_location,
            pickup_location=pickup_location,
            dropoff_location=dropoff_location,
            current_cycle_used_hrs=current_cycle_used_hrs,
            start_time=start_time,
            current_location_coords=current_location_coords,
            pickup_location_coords=pickup_location_coords,
            dropoff_location_coords=dropoff_location_coords,
        )

        route = get_route(trip_request)
        if route is None:
            return JsonResponse(
                {"error": "Could not find route. Check addresses and try again."},
                status=400,
            )

        timeline = build_timeline(trip_request, route)
        log_sheets = build_log_sheets(timeline, trip_request)
        stops_and_rests = _build_stops_and_rests(timeline, route)

        return JsonResponse(
            {
                "route": route_to_dict(route),
                "stops_and_rests": stops_and_rests,
                "log_sheets": [daily_log_to_dict(log) for log in log_sheets],
            },
            safe=False,
        )


@method_decorator(csrf_exempt, name="dispatch")
@method_decorator(require_http_methods(["GET"]), name="dispatch")
class PlaceSuggestionsView(View):
    """GET /api/places/?q=... - autocomplete location suggestions."""

    def get(self, request):
        query = (request.GET.get("q") or "").strip()
        if len(query) < 2:
            return JsonResponse({"suggestions": []})

        token = getattr(settings, "MAPBOX_ACCESS_TOKEN", "") or ""
        if not token:
            return JsonResponse({"suggestions": []})

        try:
            suggestions = search_places(query, token, limit=5)
        except Exception:  # noqa: BLE001
            suggestions = []

        return JsonResponse({"suggestions": suggestions})


def debug_mapbox_view(request):
    """GET /api/debug/ - whether MAPBOX_ACCESS_TOKEN is set (no value exposed)."""
    token = getattr(settings, "MAPBOX_ACCESS_TOKEN", "") or ""
    return JsonResponse({"mapbox_configured": bool(token)})
