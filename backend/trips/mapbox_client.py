"""
Mapbox geocoding and directions. Builds a Route from a TripRequest.
"""

import requests
from django.conf import settings

from .schemas import Route, RouteLeg, TripRequest

GEOCODE_URL = "https://api.mapbox.com/geocoding/v5/mapbox.places"
DIRECTIONS_URL = "https://api.mapbox.com/directions/v5/mapbox/driving"
METERS_TO_MILES = 0.000621371
SECONDS_TO_HOURS = 1 / 3600


def _geocode(query: str, token: str) -> list:
    """Return [lng, lat] for first result, or empty list if not found."""
    resp = requests.get(
        f"{GEOCODE_URL}/{requests.utils.quote(query)}.json",
        params={"access_token": token, "limit": 1, "country": "us"},
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()
    features = data.get("features", [])
    if not features:
        return []
    return features[0]["center"]


def search_places(query: str, token: str, limit: int = 5) -> list[dict]:
    """Return autocomplete place suggestions for location inputs."""
    if not query.strip():
        return []
    resp = requests.get(
        f"{GEOCODE_URL}/{requests.utils.quote(query)}.json",
        params={
            "access_token": token,
            "limit": max(1, min(int(limit), 10)),
            "autocomplete": "true",
            "types": "place,address,postcode",
            "country": "us",
        },
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()
    features = data.get("features", [])
    return [
        {
            "name": feature.get("place_name") or feature.get("text") or "",
            "coordinates": feature.get("center") or [],
        }
        for feature in features
        if feature.get("center")
    ]


def _coords_to_str(coords: list) -> str:
    """Format coords for Directions API: lng,lat;lng,lat;..."""
    return ";".join(f"{c[0]},{c[1]}" for c in coords)


def get_route(request: TripRequest, token: str = ""):
    """
    Geocode current, pickup, dropoff; get driving directions; return Route.
    Returns None if geocoding or directions fail.
    """
    token = (token or getattr(settings, "MAPBOX_ACCESS_TOKEN", "") or "").strip()
    if not token:
        return None

    current = request.current_location_coords or _geocode(request.current_location, token)
    pickup = request.pickup_location_coords or _geocode(request.pickup_location, token)
    dropoff = request.dropoff_location_coords or _geocode(request.dropoff_location, token)
    if not current or not pickup or not dropoff:
        return None

    coords = _coords_to_str([current, pickup, dropoff])
    resp = requests.get(
        f"{DIRECTIONS_URL}/{coords}",
        params={
            "access_token": token,
            "geometries": "geojson",
        },
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    routes = data.get("routes", [])
    if not routes:
        return None

    route = routes[0]
    geometry = route.get("geometry", {}).get("coordinates", [])
    distance_m = route.get("distance", 0)
    duration_s = route.get("duration", 0)
    distance_miles = distance_m * METERS_TO_MILES
    duration_hours = duration_s * SECONDS_TO_HOURS

    legs = []
    for leg in route.get("legs", []):
        dm = leg.get("distance", 0)
        ds = leg.get("duration", 0)
        leg_geom = leg.get("geometry", {}).get("coordinates", [])
        legs.append(
            RouteLeg(
                distance_miles=dm * METERS_TO_MILES,
                duration_hours=ds * SECONDS_TO_HOURS,
                geometry=leg_geom,
            )
        )

    return Route(
        geometry=geometry,
        distance_miles=distance_miles,
        duration_hours=duration_hours,
        legs=legs,
        waypoints=[current, pickup, dropoff],
    )
