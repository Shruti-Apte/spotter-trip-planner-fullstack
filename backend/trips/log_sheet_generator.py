"""
Split timeline by calendar day and build one DailyLog per day.
Fills grid segments and totals for each sheet.
"""

from collections import defaultdict
from datetime import date, datetime, time, timedelta

from .schemas import DailyLog, DutyStatus, LogGridSegment, TimelineSegment, TripRequest


def _segment_to_grid(seg: TimelineSegment) -> LogGridSegment:
    return LogGridSegment(
        status=seg.status,
        start_time=seg.start_time,
        end_time=seg.end_time,
        duration_minutes=seg.duration_minutes,
        description=seg.description,
    )


def _split_segment_by_day(seg: TimelineSegment) -> list[tuple[date, LogGridSegment]]:
    """Split one timeline segment into (date, LogGridSegment) for each day it touches."""
    out = []
    start = seg.start_time
    end = seg.end_time
    remaining_min = seg.duration_minutes

    if isinstance(start, str):
        start = datetime.fromisoformat(start.replace("Z", "+00:00"))
    if isinstance(end, str):
        end = datetime.fromisoformat(end.replace("Z", "+00:00"))

    tz = getattr(start, "tzinfo", None)
    current_start = start
    while remaining_min > 0 and current_start < end:
        day_start = datetime.combine(current_start.date(), time(0, 0), tzinfo=tz)
        day_end = day_start + timedelta(days=1)
        segment_end = min(end, day_end)
        chunk_min = (segment_end - current_start).total_seconds() / 60
        if chunk_min <= 0:
            break
        out.append(
            (
                current_start.date(),
                LogGridSegment(
                    status=seg.status,
                    start_time=current_start,
                    end_time=segment_end,
                    duration_minutes=chunk_min,
                    description=seg.description,
                ),
            )
        )
        remaining_min -= chunk_min
        current_start = segment_end

    return out


def _totals_for_segments(segments: list[LogGridSegment]) -> tuple[float, float, float, float]:
    driving = 0.0
    on_duty = 0.0
    off_duty = 0.0
    sleeper = 0.0
    for s in segments:
        hrs = s.duration_minutes / 60
        if s.status == DutyStatus.DRIVING:
            driving += hrs
        if s.status == DutyStatus.ON_DUTY_NOT_DRIVING:
            on_duty += hrs
        if s.status == DutyStatus.OFF_DUTY:
            off_duty += hrs
        if s.status == DutyStatus.SLEEPER_BERTH:
            sleeper += hrs
    return driving, on_duty, off_duty, sleeper


def build_log_sheets(
    timeline: list[TimelineSegment],
    request: TripRequest,
) -> list[DailyLog]:
    """
    Group timeline by calendar day, split segments that span midnight,
    and build one DailyLog per day with totals.
    """
    by_day: dict[date, list[LogGridSegment]] = defaultdict(list)

    for seg in timeline:
        for d, grid_seg in _split_segment_by_day(seg):
            by_day[d].append(grid_seg)

    if not by_day:
        return []

    sorted_dates = sorted(by_day.keys())
    logs = []
    for i, log_date in enumerate(sorted_dates):
        segments = sorted(by_day[log_date], key=lambda s: s.start_time)
        driving, on_duty_nd, off_duty, sleeper = _totals_for_segments(segments)
        total_on_duty = driving + on_duty_nd

        if i == 0:
            from_place = request.current_location
            to_place = request.pickup_location
        else:
            from_place = request.pickup_location
            to_place = request.dropoff_location

        logs.append(
            DailyLog(
                log_date=log_date,
                from_place=from_place,
                to_place=to_place,
                segments=segments,
                total_driving_hours=round(driving, 2),
                total_on_duty_hours=round(total_on_duty, 2),
                total_off_duty_hours=round(off_duty, 2),
                total_sleeper_hours=round(sleeper, 2),
            )
        )

    return logs
