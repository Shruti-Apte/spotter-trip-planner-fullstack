"""
Data shapes for trip planning and ELD logs.
Used in-memory and for API request/response; not stored in the database.
"""

from dataclasses import dataclass, field
from datetime import date, datetime
from enum import Enum
from typing import List, Optional

# Duty status – matches FMCSA log grid rows
class DutyStatus(str, Enum):
    OFF_DUTY = "off_duty"
    SLEEPER_BERTH = "sleeper_berth"
    DRIVING = "driving"
    ON_DUTY_NOT_DRIVING = "on_duty_not_driving"


# Trip request – user input
@dataclass
class TripRequest:
    current_location: str
    pickup_location: str
    dropoff_location: str
    current_cycle_used_hrs: float
    start_time: datetime
    current_location_coords: Optional[List[float]] = None
    pickup_location_coords: Optional[List[float]] = None
    dropoff_location_coords: Optional[List[float]] = None

    def __post_init__(self):
        if isinstance(self.start_time, str):
            self.start_time = datetime.fromisoformat(
                self.start_time.replace("Z", "+00:00")
            )


# Route – from Mapbox Directions
@dataclass
class RouteLeg:
    distance_miles: float
    duration_hours: float
    geometry: List[List[float]] = field(default_factory=list)


@dataclass
class Route:
    geometry: List[List[float]]
    distance_miles: float
    duration_hours: float
    legs: List[RouteLeg] = field(default_factory=list)
    # Waypoint coordinates [lng, lat] for map markers: start, pickup, dropoff
    waypoints: List[List[float]] = field(default_factory=list)


# Timeline – one chunk of the driver’s day (full trip)
@dataclass
class TimelineSegment:
    status: DutyStatus
    start_time: datetime
    end_time: datetime
    duration_minutes: float
    description: str = ""

    def __post_init__(self):
        if isinstance(self.start_time, str):
            self.start_time = datetime.fromisoformat(
                self.start_time.replace("Z", "+00:00")
            )
        if isinstance(self.end_time, str):
            self.end_time = datetime.fromisoformat(
                self.end_time.replace("Z", "+00:00")
            )


# One block on the 24h log grid (per day)
@dataclass
class LogGridSegment:
    status: DutyStatus
    start_time: datetime
    end_time: datetime
    duration_minutes: float
    description: str = ""


# One day’s log sheet
@dataclass
class DailyLog:
    log_date: date
    from_place: str
    to_place: str
    segments: List[LogGridSegment]
    total_driving_hours: float
    total_on_duty_hours: float
    total_off_duty_hours: float = 0.0
    total_sleeper_hours: float = 0.0

    def __post_init__(self):
        if isinstance(self.log_date, str):
            self.log_date = date.fromisoformat(self.log_date)
