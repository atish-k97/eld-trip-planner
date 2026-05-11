import os
from dataclasses import dataclass
from math import ceil
from typing import Any, Dict, List, Optional, Tuple

import requests


ORS_GEOCODE_URL = "https://api.openrouteservice.org/geocode/search"
ORS_DIRECTIONS_URL = "https://api.openrouteservice.org/v2/directions/driving-car/geojson"
MILES_PER_METER = 0.000621371


class HosCalculationError(RuntimeError):
    pass


def _require_ors_api_key() -> str:
    key = os.getenv("ORS_API_KEY")
    if not key:
        raise HosCalculationError("ORS_API_KEY is not set in environment/.env")
    return key


def _geocode_location(location: str, api_key: str, timeout_s: int = 20) -> Tuple[float, float]:
    """
    Returns (lon, lat).
    """
    resp = requests.get(
        ORS_GEOCODE_URL,
        params={"text": location, "size": 1},
        headers={"Authorization": api_key},
        timeout=timeout_s,
    )
    if resp.status_code != 200:
        raise HosCalculationError(f"ORS geocode failed ({resp.status_code}): {resp.text[:300]}")
    data = resp.json()
    features = data.get("features") or []
    if not features:
        raise HosCalculationError(f"ORS geocode returned no results for: {location}")
    coords = (features[0].get("geometry") or {}).get("coordinates")
    if not (isinstance(coords, list) and len(coords) == 2):
        raise HosCalculationError(f"ORS geocode returned invalid coordinates for: {location}")
    lon, lat = float(coords[0]), float(coords[1])
    return lon, lat


def _route_distance_duration(
    start_lon_lat: Tuple[float, float],
    end_lon_lat: Tuple[float, float],
    api_key: str,
    timeout_s: int = 30,
) -> Tuple[float, float]:
    """
    Returns (distance_meters, duration_seconds) for driving-car route.
    """
    resp = requests.post(
        ORS_DIRECTIONS_URL,
        json={"coordinates": [list(start_lon_lat), list(end_lon_lat)]},
        headers={"Authorization": api_key, "Content-Type": "application/json"},
        timeout=timeout_s,
    )
    if resp.status_code != 200:
        raise HosCalculationError(f"ORS directions failed ({resp.status_code}): {resp.text[:300]}")
    data = resp.json()
    routes = data.get("features") or []
    if not routes:
        raise HosCalculationError("ORS directions returned no route features")
    props = (routes[0].get("properties") or {})
    summary = props.get("summary") or {}
    dist_m = float(summary.get("distance") or 0.0)
    dur_s = float(summary.get("duration") or 0.0)
    if dist_m <= 0 or dur_s <= 0:
        segments = props.get("segments") or []
        if segments:
            dist_m = float(segments[0].get("distance", 0.0))
            dur_s = float(segments[0].get("duration", 0.0))
    if dist_m <= 0 or dur_s <= 0:
        raise HosCalculationError("ORS directions returned invalid distance/duration")
    return dist_m, dur_s

@dataclass
class _DayState:
    day: int
    t: float  # hours from start of this day
    window_started: bool
    window_elapsed: float  # hours since window start (includes breaks)
    driving_today: float
    driving_since_break: float
    segments: List[Dict[str, Any]]
    stops: List[Dict[str, Any]]


def _round_hour(x: float) -> float:
    # keep outputs stable for UI rendering
    return round(float(x) + 1e-9, 2)


def _append_segment(day: _DayState, status: str, duration_h: float) -> None:
    if duration_h <= 0:
        return
    start = day.t
    end = day.t + duration_h
    day.segments.append(
        {"status": status, "start": _round_hour(start), "end": _round_hour(end)}
    )
    day.t = end


def _append_stop(day: _DayState, stop_type: str, location: str, global_hour: float) -> Dict[str, Any]:
    stop = {"type": stop_type, "location": location, "hour": _round_hour(global_hour)}
    day.stops.append({"type": stop_type, "location": location, "time": _round_hour(day.t)})
    return stop


def calculate_trip(
    current_location: str,
    pickup_location: str,
    dropoff_location: str,
    cycle_used_hours: float,
) -> Dict[str, Any]:
    """
    Plans a trip from current -> pickup -> dropoff, enforcing simplified HOS rules:
    - 70hr/8-day cycle (cap total on-duty for this plan)
    - 11hr max driving per shift/day
    - 14hr on-duty window per shift/day (clock runs once started)
    - 30min break after 8hrs cumulative driving (break counts against 14hr window)
    - 10hr off-duty reset between shifts
    - Fuel every 1,000 miles (0.5hr on-duty not driving)
    - 1hr on-duty not driving at pickup and dropoff
    """
    if cycle_used_hours < 0:
        raise HosCalculationError("cycle_used_hours must be >= 0")

    cycle_remaining = 70.0 - float(cycle_used_hours)
    if cycle_remaining <= 0:
        raise HosCalculationError("Cycle limit exceeded (70hr/8-day). No hours remaining.")

    api_key = _require_ors_api_key()

    cur_xy = _geocode_location(current_location, api_key)
    pick_xy = _geocode_location(pickup_location, api_key)
    drop_xy = _geocode_location(dropoff_location, api_key)

    leg1_m, leg1_s = _route_distance_duration(cur_xy, pick_xy, api_key)
    leg2_m, leg2_s = _route_distance_duration(pick_xy, drop_xy, api_key)

    total_distance_miles = (leg1_m + leg2_m) * MILES_PER_METER
    total_drive_hours = (leg1_s + leg2_s) / 3600.0

    # Build leg driving tasks (miles, hours) assuming constant speed within each leg.
    legs = [
        {"name": "to_pickup", "from": current_location, "to": pickup_location, "miles": leg1_m * MILES_PER_METER, "hours": leg1_s / 3600.0},
        {"name": "to_dropoff", "from": pickup_location, "to": dropoff_location, "miles": leg2_m * MILES_PER_METER, "hours": leg2_s / 3600.0},
    ]

    days: List[Dict[str, Any]] = []
    all_stops: List[Dict[str, Any]] = []

    global_t = 0.0
    day_idx = 1

    def new_day(idx: int) -> _DayState:
        return _DayState(
            day=idx,
            t=0.0,
            window_started=False,
            window_elapsed=0.0,
            driving_today=0.0,
            driving_since_break=0.0,
            segments=[],
            stops=[],
        )

    day = new_day(day_idx)

    def ensure_shift_started() -> None:
        nonlocal day
        if not day.window_started:
            day.window_started = True
            day.window_elapsed = 0.0

    def consume_time(status: str, duration_h: float, counts_toward_cycle: bool, counts_toward_window: bool) -> None:
        nonlocal cycle_remaining, global_t
        if duration_h <= 0:
            return

        if counts_toward_window:
            ensure_shift_started()
            if day.window_elapsed + duration_h - 1e-9 > 14.0:
                raise HosCalculationError("Internal error: exceeded 14hr window")
            day.window_elapsed += duration_h

        if counts_toward_cycle:
            if cycle_remaining + 1e-9 < duration_h:
                raise HosCalculationError(
                    "Not enough remaining 70hr/8-day cycle hours to complete planned trip."
                )
            cycle_remaining -= duration_h

        _append_segment(day, status, duration_h)
        global_t += duration_h

    def end_shift_and_roll_day() -> None:
        nonlocal day, day_idx, global_t
        # 10hr off-duty reset between shifts (does NOT count to cycle, and does NOT start window)
        consume_time("off_duty", 10.0, counts_toward_cycle=False, counts_toward_window=False)
        days.append({"day": day.day, "segments": day.segments, "stops": day.stops})
        day_idx += 1
        day = new_day(day_idx)

    # Start with an initial 10hr off-duty reset so day timelines start at 0.0.
    consume_time("off_duty", 10.0, counts_toward_cycle=False, counts_toward_window=False)

    miles_since_fuel = 0.0
    fuel_interval_miles = 1000.0

    def maybe_take_break_before_more_driving() -> None:
        # 30min break required after 8hrs cumulative driving.
        if day.driving_since_break >= 8.0 - 1e-9:
            all_stops.append(_append_stop(day, "break", "Rest break", global_t))
            consume_time("off_duty", 0.5, counts_toward_cycle=False, counts_toward_window=True)
            day.driving_since_break = 0.0

    def maybe_fuel_stop() -> None:
        # Called only when we have just crossed a 1000-mile boundary.
        all_stops.append(_append_stop(day, "fuel", "En route", global_t))
        consume_time("on_duty_not_driving", 0.5, counts_toward_cycle=True, counts_toward_window=True)

    def on_duty_service(stop_type: str, location: str, service_h: float) -> None:
        all_stops.append(_append_stop(day, stop_type, location, global_t))
        consume_time("on_duty_not_driving", service_h, counts_toward_cycle=True, counts_toward_window=True)

    # Drive legs, injecting required stops, breaks, and shift resets.
    for leg in legs:
        remaining_miles = float(leg["miles"])
        remaining_hours = float(leg["hours"])

        # Derive a stable speed for this leg.
        speed_mph = remaining_miles / remaining_hours if remaining_hours > 0 else 0.0
        if speed_mph <= 1e-6:
            raise HosCalculationError("Invalid route speed from ORS (duration too large/zero).")

        while remaining_hours > 1e-9:
            ensure_shift_started()

            # Enforce daily/shift constraints; roll to next shift if needed.
            if day.driving_today >= 11.0 - 1e-9 or day.window_elapsed >= 14.0 - 1e-9:
                end_shift_and_roll_day()
                continue

            maybe_take_break_before_more_driving()

            # Remaining capacity this shift.
            drive_cap = min(
                11.0 - day.driving_today,
                14.0 - day.window_elapsed,
                8.0 - day.driving_since_break,
            )

            if drive_cap <= 1e-9:
                # No driving possible; if window is exhausted, roll shift; otherwise break will be handled next loop.
                if day.window_elapsed >= 14.0 - 1e-9:
                    end_shift_and_roll_day()
                else:
                    maybe_take_break_before_more_driving()
                continue

            # Fueling constraint based on miles.
            miles_to_next_fuel = fuel_interval_miles - (miles_since_fuel % fuel_interval_miles)
            # If exactly at boundary, don't immediately fuel unless we have already driven some miles since last fueling.
            if abs(miles_to_next_fuel - fuel_interval_miles) < 1e-6:
                miles_to_next_fuel = fuel_interval_miles

            hours_to_fuel = miles_to_next_fuel / speed_mph

            chunk_h = min(remaining_hours, drive_cap, hours_to_fuel)
            chunk_miles = chunk_h * speed_mph

            # Consume driving chunk
            consume_time("driving", chunk_h, counts_toward_cycle=True, counts_toward_window=True)
            day.driving_today += chunk_h
            day.driving_since_break += chunk_h
            remaining_hours -= chunk_h
            remaining_miles -= chunk_miles
            miles_since_fuel += chunk_miles

            # If we hit a fueling boundary (within tolerance) and still have driving to do, fuel.
            at_fuel_boundary = (miles_since_fuel % fuel_interval_miles) < 1e-3 or (
                fuel_interval_miles - (miles_since_fuel % fuel_interval_miles)
            ) < 1e-3
            if at_fuel_boundary and (remaining_hours > 1e-6):
                # Ensure we still have window time to fuel; otherwise end shift and fuel next shift.
                if day.window_elapsed + 0.5 <= 14.0 + 1e-9:
                    maybe_fuel_stop()
                else:
                    end_shift_and_roll_day()

        # On arrival, apply pickup/dropoff service time.
        if leg["name"] == "to_pickup":
            on_duty_service("pickup", pickup_location, 1.0)
        elif leg["name"] == "to_dropoff":
            on_duty_service("dropoff", dropoff_location, 1.0)

    # Finalize last day record
    days.append({"day": day.day, "segments": day.segments, "stops": day.stops})

    return {
        "total_distance_miles": _round_hour(total_distance_miles),
        "total_duration_hours": _round_hour(global_t),
        "days": days,
        "stops": all_stops,
    }

