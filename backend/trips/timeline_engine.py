"""
Build a timeline of duty segments from a trip request and route.
Applies HOS: 11hr drive, 14hr window, 30min non-driving break,
10hr reset, optional split-sleeper pair, and 70hr/8day with restart handling.
"""

from dataclasses import dataclass
from datetime import timedelta

from .schemas import DutyStatus, Route, TimelineSegment, TripRequest

DRIVE_LIMIT_MIN = 11 * 60
WINDOW_LIMIT_MIN = 14 * 60
BREAK_AFTER_DRIVE_MIN = 8 * 60
BREAK_DURATION_MIN = 30
REST_DURATION_MIN = 10 * 60
RESTART_34H_MIN = 34 * 60
CYCLE_LIMIT_MIN = 70 * 60
PICKUP_DROPOFF_MIN = 60
FUEL_INTERVAL_MILES = 1000
FUEL_STOP_MIN = 30
SPLIT_SHORT_REST_MIN = 2 * 60
SPLIT_LONG_SLEEPER_MIN = 7 * 60

ON_DUTY_STATUSES = {
    DutyStatus.DRIVING,
    DutyStatus.ON_DUTY_NOT_DRIVING,
}


@dataclass
class HOSState:
    current: object
    drive_since_reset: float
    window_since_reset: float
    driving_since_break: float
    non_driving_streak: float
    rolling_cycle_min: float
    cycle_decay_per_min: float
    split_stage: int = 0  # 0 none, 1 short break taken, waiting for sleeper part


def _advance_cycle(state: HOSState, elapsed_min: float, on_duty_add_min: float):
    if elapsed_min > 0 and state.cycle_decay_per_min > 0:
        state.rolling_cycle_min = max(
            0.0,
            state.rolling_cycle_min - (state.cycle_decay_per_min * elapsed_min),
        )
    state.rolling_cycle_min += max(0.0, on_duty_add_min)


def _add_segment(
    segments: list[TimelineSegment],
    state: HOSState,
    status: DutyStatus,
    duration_min: float,
    description: str,
    *,
    count_toward_window: bool = True,
):
    end = state.current + timedelta(minutes=duration_min)
    segments.append(
        TimelineSegment(
            status=status,
            start_time=state.current,
            end_time=end,
            duration_minutes=duration_min,
            description=description,
        )
    )

    on_duty_add = duration_min if status in ON_DUTY_STATUSES else 0.0
    _advance_cycle(state, duration_min, on_duty_add)

    if status == DutyStatus.DRIVING:
        state.drive_since_reset += duration_min
        state.window_since_reset += duration_min
        state.driving_since_break += duration_min
        state.non_driving_streak = 0.0
    else:
        if count_toward_window:
            state.window_since_reset += duration_min
        state.non_driving_streak += duration_min
        if state.non_driving_streak >= BREAK_DURATION_MIN:
            state.driving_since_break = 0.0

    state.current = end


def _insert_10h_reset(segments: list[TimelineSegment], state: HOSState, reason: str = "10-hour rest"):
    _add_segment(
        segments,
        state,
        DutyStatus.SLEEPER_BERTH,
        REST_DURATION_MIN,
        reason,
        count_toward_window=False,
    )
    state.drive_since_reset = 0.0
    state.window_since_reset = 0.0
    state.driving_since_break = 0.0
    state.non_driving_streak = REST_DURATION_MIN
    state.split_stage = 0


def _insert_34h_restart(segments: list[TimelineSegment], state: HOSState):
    _add_segment(
        segments,
        state,
        DutyStatus.SLEEPER_BERTH,
        RESTART_34H_MIN,
        "34-hour restart",
        count_toward_window=False,
    )
    state.drive_since_reset = 0.0
    state.window_since_reset = 0.0
    state.driving_since_break = 0.0
    state.non_driving_streak = RESTART_34H_MIN
    state.rolling_cycle_min = 0.0
    state.split_stage = 0


def _insert_split_short(segments: list[TimelineSegment], state: HOSState):
    _add_segment(
        segments,
        state,
        DutyStatus.OFF_DUTY,
        SPLIT_SHORT_REST_MIN,
        "Split sleeper break (2 hr off duty)",
        count_toward_window=False,
    )
    state.split_stage = 1


def _insert_split_long(segments: list[TimelineSegment], state: HOSState):
    _add_segment(
        segments,
        state,
        DutyStatus.SLEEPER_BERTH,
        SPLIT_LONG_SLEEPER_MIN,
        "Split sleeper berth (7 hr)",
        count_toward_window=False,
    )
    # Paired split breaks are excluded from driving window calculations.
    state.window_since_reset = max(
        0.0,
        state.window_since_reset - (SPLIT_SHORT_REST_MIN + SPLIT_LONG_SLEEPER_MIN),
    )
    state.split_stage = 0


def _ensure_cycle_capacity_for_on_duty(
    segments: list[TimelineSegment],
    state: HOSState,
    required_min: float,
):
    while state.rolling_cycle_min + required_min > CYCLE_LIMIT_MIN:
        _insert_34h_restart(segments, state)


def _drive_with_hos(
    segments: list[TimelineSegment],
    state: HOSState,
    drive_min_total: float,
    description: str,
):
    remaining_drive = drive_min_total

    while remaining_drive > 0:
        if state.rolling_cycle_min >= CYCLE_LIMIT_MIN:
            _insert_34h_restart(segments, state)
            continue

        if state.driving_since_break >= BREAK_AFTER_DRIVE_MIN:
            _add_segment(
                segments,
                state,
                DutyStatus.OFF_DUTY,
                BREAK_DURATION_MIN,
                "30-minute break",
                count_toward_window=True,
            )
            continue

        if state.drive_since_reset >= DRIVE_LIMIT_MIN:
            _insert_10h_reset(segments, state, "10-hour rest (11hr drive limit)")
            continue

        if state.window_since_reset >= WINDOW_LIMIT_MIN:
            # Try a split-sleeper pair first when the issue is window exhaustion.
            if state.split_stage == 0:
                _insert_split_short(segments, state)
                continue
            _insert_split_long(segments, state)
            if state.window_since_reset >= WINDOW_LIMIT_MIN:
                _insert_10h_reset(segments, state, "10-hour rest (14hr window)")
            continue

        drive_window_left = WINDOW_LIMIT_MIN - state.window_since_reset
        drive_limit_left = DRIVE_LIMIT_MIN - state.drive_since_reset
        break_left = BREAK_AFTER_DRIVE_MIN - state.driving_since_break
        if break_left <= 0:
            break_left = BREAK_AFTER_DRIVE_MIN

        chunk = min(remaining_drive, drive_window_left, drive_limit_left, break_left)
        if chunk <= 0:
            continue

        _add_segment(
            segments,
            state,
            DutyStatus.DRIVING,
            chunk,
            description or "Driving",
        )
        remaining_drive -= chunk


def _split_leg_by_fuel(
    distance_miles: float,
    duration_hours: float,
) -> list[tuple[float, float]]:
    """Return list of (miles, hours) for each segment between fuel stops."""
    if distance_miles <= 0:
        return [(0, 0.0)]

    segments = []
    miles_left = distance_miles
    miles_per_hour = distance_miles / duration_hours if duration_hours else 0

    while miles_left > 0:
        segment_miles = min(miles_left, FUEL_INTERVAL_MILES)
        segment_hours = segment_miles / miles_per_hour if miles_per_hour else 0
        segments.append((segment_miles, segment_hours))
        miles_left -= segment_miles

    return segments


def build_timeline(request: TripRequest, route: Route) -> list[TimelineSegment]:
    """
    Build full timeline: drive to pickup, 1hr pickup, drive to dropoff
    (with fuel stops and HOS breaks/rest), 1hr dropoff.
    """
    segments: list[TimelineSegment] = []

    initial_cycle_min = max(0.0, request.current_cycle_used_hrs * 60)
    # Approximate rolling-window drop-off rate for unknown pre-trip history.
    decay_per_min = initial_cycle_min / (8 * 24 * 60) if initial_cycle_min > 0 else 0.0

    state = HOSState(
        current=request.start_time,
        drive_since_reset=0.0,
        window_since_reset=0.0,
        driving_since_break=0.0,
        non_driving_streak=0.0,
        rolling_cycle_min=initial_cycle_min,
        cycle_decay_per_min=decay_per_min,
    )

    if not route.legs:
        _drive_with_hos(segments, state, route.duration_hours * 60, "Driving")
        return segments

    # Leg 0: current -> pickup
    leg0 = route.legs[0]
    fuel_segments = _split_leg_by_fuel(leg0.distance_miles, leg0.duration_hours)
    for i, (seg_miles, seg_hours) in enumerate(fuel_segments):
        _drive_with_hos(segments, state, seg_hours * 60, "Driving to pickup")
        if i < len(fuel_segments) - 1 and seg_miles >= FUEL_INTERVAL_MILES:
            _ensure_cycle_capacity_for_on_duty(segments, state, FUEL_STOP_MIN)
            _add_segment(
                segments,
                state,
                DutyStatus.ON_DUTY_NOT_DRIVING,
                FUEL_STOP_MIN,
                "Fuel stop",
                count_toward_window=True,
            )

    # 1 hr at pickup
    _ensure_cycle_capacity_for_on_duty(segments, state, PICKUP_DROPOFF_MIN)
    _add_segment(
        segments,
        state,
        DutyStatus.ON_DUTY_NOT_DRIVING,
        PICKUP_DROPOFF_MIN,
        "Pickup (1 hr)",
        count_toward_window=True,
    )

    # Leg 1: pickup -> dropoff
    leg1 = route.legs[1]
    fuel_segments = _split_leg_by_fuel(leg1.distance_miles, leg1.duration_hours)
    for i, (seg_miles, seg_hours) in enumerate(fuel_segments):
        _drive_with_hos(segments, state, seg_hours * 60, "Driving to dropoff")
        if i < len(fuel_segments) - 1 and seg_miles >= FUEL_INTERVAL_MILES:
            _ensure_cycle_capacity_for_on_duty(segments, state, FUEL_STOP_MIN)
            _add_segment(
                segments,
                state,
                DutyStatus.ON_DUTY_NOT_DRIVING,
                FUEL_STOP_MIN,
                "Fuel stop",
                count_toward_window=True,
            )

    # 1 hr at dropoff
    _ensure_cycle_capacity_for_on_duty(segments, state, PICKUP_DROPOFF_MIN)
    _add_segment(
        segments,
        state,
        DutyStatus.ON_DUTY_NOT_DRIVING,
        PICKUP_DROPOFF_MIN,
        "Dropoff (1 hr)",
        count_toward_window=True,
    )

    return segments
