function formatDate(isoDate) {
  if (!isoDate) return 'Unknown day';
  try {
    return new Date(isoDate).toLocaleDateString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return isoDate;
  }
}

function formatDateParts(isoDate) {
  if (!isoDate) return { month: '--', day: '--', year: '----' };
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return { month: '--', day: '--', year: '----' };
  return {
    month: String(d.getMonth() + 1).padStart(2, '0'),
    day: String(d.getDate()).padStart(2, '0'),
    year: String(d.getFullYear()),
  };
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function formatHours(value) {
  return `${round2(value)} h`;
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg bg-white/80 dark:bg-gray-900/80 border border-gray-200/80 dark:border-gray-700 px-2.5 py-2">
      <p className="text-[11px] uppercase tracking-[0.1em] text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{value}</p>
    </div>
  );
}

function MetaField({ label, value }) {
  return (
    <div className="rounded-lg border border-gray-200/80 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-900/60 px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-0.5 text-xs font-medium text-gray-800 dark:text-gray-100 break-words">
        {value || '-'}
      </p>
    </div>
  );
}

const ROWS = [
  { key: 'off_duty', label: 'Off' },
  { key: 'sleeper_berth', label: 'Sleeper' },
  { key: 'driving', label: 'Drive' },
  { key: 'on_duty_not_driving', label: 'On duty' },
];

function toMinuteOfDay(iso) {
  if (!iso) return 0;
  const d = new Date(iso);
  return (d.getHours() * 60) + d.getMinutes() + (d.getSeconds() / 60);
}

function formatTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function GridLines() {
  return (
    <div className="absolute inset-0 pointer-events-none">
      {Array.from({ length: 25 }).map((_, i) => (
        <div
          // eslint-disable-next-line react/no-array-index-key
          key={i}
          className="absolute top-0 bottom-0 w-px bg-gray-200/80 dark:bg-gray-700/70"
          style={{ left: `${(i / 24) * 100}%` }}
        />
      ))}
    </div>
  );
}

function getStatusY(status) {
  const rowIdx = ROWS.findIndex((r) => r.key === status);
  const safeIdx = rowIdx === -1 ? 0 : rowIdx;
  return safeIdx * 40 + 20;
}

function buildDutyPath(segments) {
  const sorted = [...(segments || [])]
    .filter((seg) => Number(seg.duration_minutes || 0) > 0)
    .sort((a, b) => {
      const aStart = new Date(a.start_time).getTime();
      const bStart = new Date(b.start_time).getTime();
      if (aStart !== bStart) return aStart - bStart;
      return new Date(a.end_time).getTime() - new Date(b.end_time).getTime();
    });

  if (!sorted.length) return '';

  const rawChunks = [];
  let cursorMin = 0;

  for (const seg of sorted) {
    const startRaw = toMinuteOfDay(seg.start_time);
    const endRaw = toMinuteOfDay(seg.end_time);
    let startMin = Math.max(0, Math.min(1440, startRaw));
    let endMin = Math.max(0, Math.min(1440, endRaw));
    if (endMin <= startMin) {
      endMin = Math.max(startMin, Math.min(1440, startMin + Number(seg.duration_minutes || 0)));
    }
    if (endMin <= cursorMin) continue;

    // Prevent overlap/ghost lines by clipping each new segment to current cursor.
    startMin = Math.max(startMin, cursorMin);

    if (startMin > cursorMin) {
      rawChunks.push({ status: 'off_duty', startMin: cursorMin, endMin: startMin });
    }
    rawChunks.push({ status: seg.status, startMin, endMin });
    cursorMin = endMin;
  }

  if (cursorMin < 1440) {
    rawChunks.push({ status: 'off_duty', startMin: cursorMin, endMin: 1440 });
  }

  // Merge contiguous chunks with same status to ensure one horizontal segment at a time.
  const chunks = [];
  for (const chunk of rawChunks) {
    if (chunk.endMin <= chunk.startMin) continue;
    const prev = chunks[chunks.length - 1];
    if (
      prev &&
      prev.status === chunk.status &&
      Math.abs(prev.endMin - chunk.startMin) < 1e-6
    ) {
      prev.endMin = chunk.endMin;
    } else {
      chunks.push({ ...chunk });
    }
  }

  if (!chunks.length) return '';

  const toX = (min) => Number(((min / 1440) * 100).toFixed(4));
  const first = chunks[0];
  let d = `M ${toX(first.startMin)} ${getStatusY(first.status)} L ${toX(first.endMin)} ${getStatusY(first.status)}`;
  let prevStatus = first.status;
  let prevEnd = first.endMin;

  for (let i = 1; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    const transitionX = toX(Math.max(prevEnd, chunk.startMin));
    const xEnd = toX(chunk.endMin);
    const y = getStatusY(chunk.status);
    if (chunk.status !== prevStatus) {
      d += ` L ${transitionX} ${y}`;
    }
    d += ` L ${xEnd} ${y}`;
    prevStatus = chunk.status;
    prevEnd = chunk.endMin;
  }

  return d;
}

function DutyPathOverlay({ sheet }) {
  const pathD = buildDutyPath(sheet.segments || []);
  if (!pathD) return null;

  return (
    <svg
      viewBox="0 0 100 160"
      preserveAspectRatio="none"
      className="absolute inset-0 h-full w-full pointer-events-none"
      aria-label="Duty status line graph"
    >
      <path
        d={pathD}
        fill="none"
        stroke="#2F5BFF"
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function HourScale() {
  const ticks = [0, 4, 8, 12, 16, 20, 24];
  return (
    <div className="relative h-7 border-b border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/60">
      {ticks.map((h) => (
        <span
          key={h}
          className="absolute -translate-x-1/2 top-1 text-[10px] text-gray-500 dark:text-gray-400"
          style={{ left: `${(h / 24) * 100}%` }}
        >
          {h}
        </span>
      ))}
    </div>
  );
}

function DailyLogGrid({ sheet }) {
  return (
    <div className="mt-3 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="grid grid-cols-[68px_1fr]">
        <div className="border-r border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/60">
          <div className="h-7 border-b border-gray-200 dark:border-gray-700" />
          {ROWS.map((row) => (
            <div
              key={row.key}
              className="h-10 flex items-center justify-center border-b border-gray-200 dark:border-gray-700 px-1 text-[11px] font-medium text-gray-600 dark:text-gray-300"
            >
              {row.label}
            </div>
          ))}
        </div>
        <div className="relative">
          <HourScale />
          {ROWS.map((row) => (
            <div key={row.key} className="relative h-10 border-b border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-900/40">
              <GridLines />
            </div>
          ))}
          <DutyPathOverlay sheet={sheet} />
        </div>
      </div>
    </div>
  );
}

function buildDistanceBreakdown(logSheets, routeDistanceMiles) {
  const totalDrivingHours = (logSheets || []).reduce(
    (sum, day) => sum + Number(day.total_driving_hours || 0),
    0,
  );
  let cumulative = 0;
  return (logSheets || []).map((day) => {
    const ratio = totalDrivingHours > 0 ? Number(day.total_driving_hours || 0) / totalDrivingHours : 0;
    const dayMiles = (routeDistanceMiles || 0) * ratio;
    cumulative += dayMiles;
    return {
      dayMiles: round2(dayMiles),
      cumulativeMiles: round2(cumulative),
    };
  });
}

function buildRecap(logSheets, startCycleUsedHours, limitHours) {
  let runningUsed = Number(startCycleUsedHours || 0);
  return (logSheets || []).map((day) => {
    const todayOnDuty = Number(day.total_on_duty_hours || 0);
    const availableAtStart = Math.max(0, limitHours - runningUsed);
    const availableAtEnd = Math.max(0, limitHours - (runningUsed + todayOnDuty));
    runningUsed += todayOnDuty;
    return {
      availableAtStart: round2(availableAtStart),
      onDutyToday: round2(todayOnDuty),
      availableAtEnd: round2(availableAtEnd),
    };
  });
}

function buildRemarks(sheet) {
  const descriptions = (sheet.segments || [])
    .map((seg) => seg.description)
    .filter(Boolean);
  const unique = [...new Set(descriptions)];
  if (!unique.length) return 'No additional remarks.';
  return unique.join(' | ');
}

function hasRestart(sheet) {
  return (sheet.segments || []).some((seg) => {
    const isRestStatus = seg.status === 'off_duty' || seg.status === 'sleeper_berth';
    return isRestStatus && Number(seg.duration_minutes || 0) >= (34 * 60);
  });
}

export default function LogsPanel({
  logSheets,
  route,
  currentCycleUsedHours = 0,
}) {
  if (!logSheets?.length) {
    return (
      <div className="mt-2 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 px-3 py-6 text-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">No logs yet. Plan a trip to populate log days.</p>
      </div>
    );
  }

  const distanceByDay = buildDistanceBreakdown(logSheets, Number(route?.distance_miles || 0));
  const recap70 = buildRecap(logSheets, currentCycleUsedHours, 70);
  const recap60 = buildRecap(logSheets, currentCycleUsedHours, 60);

  return (
    <div className="mt-2 space-y-2.5">
      {logSheets.map((sheet, idx) => {
        const dateParts = formatDateParts(sheet.log_date);
        const miles = distanceByDay[idx] || { dayMiles: 0, cumulativeMiles: 0 };
        const row70 = recap70[idx] || { availableAtStart: 0, onDutyToday: 0, availableAtEnd: 0 };
        const row60 = recap60[idx] || { availableAtStart: 0, onDutyToday: 0, availableAtEnd: 0 };
        const restartTaken = hasRestart(sheet);
        return (
          <article
            key={`${sheet.log_date || 'day'}-${idx}`}
            className="rounded-xl border border-gray-200/90 dark:border-gray-700 bg-white/90 dark:bg-gray-900/80 p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                Day {idx + 1} - {formatDate(sheet.log_date)}
              </h4>
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-primary/10 text-primary dark:text-primary-dark">
                {sheet.segments?.length || 0} segments
              </span>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <MetaField label="Date (MM/DD/YYYY)" value={`${dateParts.month}/${dateParts.day}/${dateParts.year}`} />
              <MetaField label="Total Miles Driving Today" value={`${miles.dayMiles} mi`} />
              <MetaField label="Carrier Name" value="Spotter Logistics (Demo)" />
              <MetaField label="Main Office Address" value="Auto-filled by planner" />
              <MetaField label="From" value={sheet.from_place || '-'} />
              <MetaField label="To" value={sheet.to_place || '-'} />
              <MetaField label="Truck / Trailer" value="Truck: TBD / Trailer: TBD" />
              <MetaField label="Shipping Docs / Commodity" value={`${sheet.from_place || 'Origin'} -> ${sheet.to_place || 'Destination'}`} />
            </div>

            <DailyLogGrid sheet={sheet} />

            <div className="mt-2 grid grid-cols-2 gap-2">
              <Stat label="Driving" value={formatHours(sheet.total_driving_hours)} />
              <Stat label="On duty" value={formatHours(sheet.total_on_duty_hours)} />
              <Stat label="Off duty" value={formatHours(sheet.total_off_duty_hours)} />
              <Stat label="Sleeper" value={formatHours(sheet.total_sleeper_hours)} />
            </div>

            <div className="mt-2 grid grid-cols-1 gap-2">
              <div className="rounded-lg border border-gray-200/80 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-900/60 p-2.5">
                <p className="text-[10px] uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">Remarks</p>
                <p className="mt-1 text-xs text-gray-700 dark:text-gray-200">{buildRemarks(sheet)}</p>
              </div>
              <div className="rounded-lg border border-gray-200/80 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-900/60 p-2.5">
                <p className="text-[10px] uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">Recap (Cycle)</p>
                <div className="mt-1 grid grid-cols-1 gap-1 text-xs text-gray-700 dark:text-gray-200">
                  <p>70/8: start avail {row70.availableAtStart}h, on-duty today {row70.onDutyToday}h, end avail {row70.availableAtEnd}h</p>
                  <p>60/7: start avail {row60.availableAtStart}h, on-duty today {row60.onDutyToday}h, end avail {row60.availableAtEnd}h</p>
                  <p>34-hour restart: {restartTaken ? 'Taken' : 'Not taken on this day'}</p>
                  <p>Cumulative trip miles by end of day: {miles.cumulativeMiles} mi</p>
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
