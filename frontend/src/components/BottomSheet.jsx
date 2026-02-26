import { useState, useRef, useCallback, useEffect } from 'react';
import StopsList from './StopsList';
import LogsPanel from './LogsPanel';

const SNAP_POINTS = [0.1, 0.55, 0.9];

function getNearestSnap(percent) {
  let nearest = SNAP_POINTS[0];
  let minDist = Math.abs(percent - nearest);
  for (const p of SNAP_POINTS) {
    const d = Math.abs(percent - p);
    if (d < minDist) {
      minDist = d;
      nearest = p;
    }
  }
  return nearest;
}

function TabButton({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-150 ${
        active
          ? 'bg-white dark:bg-gray-700 text-primary dark:text-primary-dark shadow-sm'
          : 'text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100'
      }`}
    >
      {children}
    </button>
  );
}

export default function BottomSheet({
  stops,
  logSheets,
  route,
  currentCycleUsedHours = 0,
  loading,
  selectedStopIndex,
  onSelectStop = () => {},
  activeTab = 'stops',
  onTabChange = () => {},
  showStart = false,
  onStart = () => {},
}) {
  const [sheetPercent, setSheetPercent] = useState(SNAP_POINTS[0]);
  const [isDragging, setIsDragging] = useState(false);
  const startY = useRef(0);
  const startPercent = useRef(0);
  const currentPercent = useRef(sheetPercent);
  currentPercent.current = sheetPercent;

  const handleStart = useCallback((clientY) => {
    startY.current = clientY;
    startPercent.current = sheetPercent;
    setIsDragging(true);
  }, [sheetPercent]);

  const handleMove = useCallback((clientY) => {
    const delta = startY.current - clientY;
    const windowH = window.innerHeight;
    const deltaPercent = delta / windowH;
    let next = startPercent.current + deltaPercent;
    next = Math.max(SNAP_POINTS[0], Math.min(SNAP_POINTS[2], next));
    setSheetPercent(next);
  }, []);

  const handleEnd = useCallback(() => {
    setIsDragging(false);
    setSheetPercent(getNearestSnap(currentPercent.current));
  }, []);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e) => {
      if (e.touches) e.preventDefault();
      handleMove(e.touches ? e.touches[0].clientY : e.clientY);
    };
    const onUp = () => handleEnd();
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDragging, handleMove, handleEnd]);

  const heightPercent = sheetPercent * 100;

  return (
    <div
      className="absolute left-0 right-0 bottom-0 z-20 bg-white dark:bg-gray-900 rounded-t-2xl shadow-[0_-4px_20px_rgba(0,0,0,0.08)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.3)] flex flex-col transition-shadow duration-200"
      style={{
        height: `${heightPercent}%`,
        transition: isDragging ? 'none' : 'height 0.25s ease-out',
      }}
    >
      <div
        className="shrink-0 pt-2 pb-2 flex justify-center cursor-grab active:cursor-grabbing touch-none"
        onMouseDown={(e) => handleStart(e.clientY)}
        onTouchStart={(e) => handleStart(e.touches[0].clientY)}
        aria-label="Drag to resize"
      >
        <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
      </div>

      <div className="shrink-0 px-4 pb-2">
        <div className="flex w-full items-center gap-2">
          <div className="inline-flex flex-1 items-center rounded-xl bg-gray-100/90 dark:bg-gray-800 p-1">
            <TabButton active={activeTab === 'stops'} onClick={() => onTabChange('stops')}>
              Stops
            </TabButton>
            <TabButton active={activeTab === 'logs'} onClick={() => onTabChange('logs')}>
              Logs
            </TabButton>
          </div>
          {showStart && (
            <button
              type="button"
              onClick={onStart}
              className="shrink-0 rounded-xl bg-primary text-white px-4 py-2 text-sm font-semibold shadow-[0_6px_20px_rgba(47,91,255,0.3)] hover:bg-primary/90 transition-colors duration-150"
            >
              Start
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-6">
        {!route && !loading && (
          <p className="text-sm text-gray-500 dark:text-gray-400 py-2">Plan a trip to see stops and logs.</p>
        )}
        {activeTab === 'stops' ? (
          <StopsList
            stops={stops || []}
            selectedIndex={selectedStopIndex}
            onSelect={onSelectStop}
          />
        ) : (
          <LogsPanel
            logSheets={logSheets || []}
            route={route}
            currentCycleUsedHours={currentCycleUsedHours}
          />
        )}
      </div>
    </div>
  );
}
