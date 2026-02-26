"""
Turn schemas into JSON-serializable dicts for API response.
"""

from datetime import date, datetime

from .schemas import (
    DailyLog,
    DutyStatus,
    LogGridSegment,
    Route,
    RouteLeg,
    TimelineSegment,
)


def _serialize_datetime(dt: datetime):
    return dt.isoformat() if dt else None


def _serialize_date(d: date):
    return d.isoformat() if d else None


def route_to_dict(route: Route) -> dict:
    return {
        "geometry": route.geometry,
        "distance_miles": route.distance_miles,
        "duration_hours": route.duration_hours,
        "waypoints": getattr(route, "waypoints", []) or [],
        "legs": [
            {
                "distance_miles": leg.distance_miles,
                "duration_hours": leg.duration_hours,
                "geometry": getattr(leg, "geometry", []) or [],
            }
            for leg in route.legs
        ],
    }


def timeline_segment_to_dict(seg: TimelineSegment) -> dict:
    return {
        "status": seg.status.value,
        "start_time": _serialize_datetime(seg.start_time),
        "end_time": _serialize_datetime(seg.end_time),
        "duration_minutes": seg.duration_minutes,
        "description": seg.description,
    }


def log_grid_segment_to_dict(seg: LogGridSegment) -> dict:
    return {
        "status": seg.status.value,
        "start_time": _serialize_datetime(seg.start_time),
        "end_time": _serialize_datetime(seg.end_time),
        "duration_minutes": seg.duration_minutes,
        "description": seg.description,
    }


def daily_log_to_dict(log: DailyLog) -> dict:
    return {
        "log_date": _serialize_date(log.log_date),
        "from_place": log.from_place,
        "to_place": log.to_place,
        "segments": [log_grid_segment_to_dict(s) for s in log.segments],
        "total_driving_hours": log.total_driving_hours,
        "total_on_duty_hours": log.total_on_duty_hours,
        "total_off_duty_hours": log.total_off_duty_hours,
        "total_sleeper_hours": log.total_sleeper_hours,
    }
