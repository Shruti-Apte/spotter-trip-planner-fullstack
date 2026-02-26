function getStopType(stop) {
  const text = `${stop?.description || ''} ${stop?.status || ''}`.toLowerCase();
  if (text.includes('pickup')) return { key: 'pickup', label: 'Pickup', icon: 'P', color: 'bg-amber-500', text: 'text-white' };
  if (text.includes('dropoff')) return { key: 'dropoff', label: 'Dropoff', icon: 'D', color: 'bg-primary', text: 'text-white' };
  if (text.includes('fuel')) return { key: 'fuel', label: 'Fuel', icon: 'S', color: 'bg-violet-500', text: 'text-white' };
  if (text.includes('break') || text.includes('rest') || text.includes('sleeper') || text.includes('off duty')) {
    return { key: 'rest', label: 'Rest', icon: 'R', color: 'bg-emerald-500', text: 'text-white' };
  }
  return { key: 'stop', label: 'Stop', icon: 'S', color: 'bg-primary', text: 'text-white' };
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

function formatDuration(minutes) {
  if (typeof minutes !== 'number') return '';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hrs = minutes / 60;
  return `${hrs.toFixed(1)} hr`;
}

export default function StopsList({ stops, selectedIndex, onSelect }) {
  if (!stops?.length) return null;

  return (
    <div className="mt-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.11em] text-gray-500 dark:text-gray-400 mb-2">
        Stops and rests
      </h3>
      <ul className="space-y-2">
        {stops.map((stop, i) => {
          const type = getStopType(stop);
          const active = selectedIndex === i;
          return (
            <li key={`${type.key}-${i}`}>
              <button
                type="button"
                onClick={() => onSelect(i)}
                className={`w-full text-left rounded-xl border px-3 py-2.5 transition-all duration-200 ${
                  active
                    ? 'border-primary/35 bg-primary/10 dark:bg-primary/20 shadow-sm'
                    : 'border-gray-200/90 dark:border-gray-700 bg-white/90 dark:bg-gray-900/70 hover:bg-gray-50 dark:hover:bg-gray-800/80'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${type.color} ${type.text}`}>
                    {type.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                        {stop.description || type.label}
                      </p>
                      <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:text-gray-300">
                        {type.label}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {formatTime(stop.start_time)}{stop.end_time ? ` - ${formatTime(stop.end_time)}` : ''}
                      {stop.duration_minutes ? `   (${formatDuration(stop.duration_minutes)})` : ''}
                    </p>
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
