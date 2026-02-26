import { useState, useCallback, useRef, useEffect } from 'react';
import { planTrip } from './api';
import TripForm from './components/TripForm';
import MapView from './components/MapView';
import StopsList from './components/StopsList';
import BottomSheet from './components/BottomSheet';
import LogsPanel from './components/LogsPanel';

function SegmentTabs({ activeTab, onChange }) {
  return (
    <div className="inline-flex w-full items-center rounded-xl bg-gray-100/90 dark:bg-gray-800 p-1">
      <button
        type="button"
        onClick={() => onChange('stops')}
        className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-150 ${
          activeTab === 'stops'
            ? 'bg-white dark:bg-gray-700 text-primary dark:text-primary-dark shadow-sm'
            : 'text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100'
        }`}
      >
        Stops
      </button>
      <button
        type="button"
        onClick={() => onChange('logs')}
        className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-150 ${
          activeTab === 'logs'
            ? 'bg-white dark:bg-gray-700 text-primary dark:text-primary-dark shadow-sm'
            : 'text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100'
        }`}
      >
        Logs
      </button>
    </div>
  );
}

export default function App() {
  const [route, setRoute] = useState(null);
  const [stopsAndRests, setStopsAndRests] = useState(null);
  const [logSheets, setLogSheets] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedStopIndex, setSelectedStopIndex] = useState(null);
  const [leftWidthPercent, setLeftWidthPercent] = useState(35);
  const [isMobile, setIsMobile] = useState(false);
  const [activeTab, setActiveTab] = useState('stops');
  const [mode, setMode] = useState('plan');
  const [commandIndex, setCommandIndex] = useState(0);
  const [cycleUsedHours, setCycleUsedHours] = useState(0);
  const dragStateRef = useRef({
    dragging: false,
  });

  const checkMobile = useCallback(() => {
    setIsMobile(window.innerWidth < 768);
  }, []);

  useEffect(() => {
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [checkMobile]);

  const handlePlan = useCallback(async (payload) => {
    setError(null);
    setMode('plan');
    setLoading(true);
    setCycleUsedHours(payload.current_cycle_used_hrs || 0);
    try {
      const data = await planTrip(payload);
      setRoute(data.route);
      setStopsAndRests(data.stops_and_rests || []);
      setLogSheets(data.log_sheets || []);
      setSelectedStopIndex(null);
      setCommandIndex(0);
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleClear = useCallback(() => {
    setRoute(null);
    setStopsAndRests(null);
    setLogSheets(null);
    setError(null);
    setSelectedStopIndex(null);
    setCommandIndex(0);
    setMode('plan');
  }, []);

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    dragStateRef.current.dragging = true;

    const onMove = (evt) => {
      if (!dragStateRef.current.dragging) return;
      const p = (evt.clientX / window.innerWidth) * 100;
      setLeftWidthPercent(Math.min(Math.max(p, 28), 55));
    };

    const onUp = () => {
      dragStateRef.current.dragging = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  const selectedStop = selectedStopIndex != null ? stopsAndRests?.[selectedStopIndex] : null;
  const nextStop = stopsAndRests?.[selectedStopIndex ?? 0];
  const commandDeck = [
    nextStop?.description
      ? `Next important stop: ${nextStop.description}.`
      : 'Next important stop: Continue on the planned route.',
    route
      ? `Trip summary: ${route.distance_miles?.toFixed(0) || 0} miles, ${route.duration_hours?.toFixed(1) || 0} hours estimated driving.`
      : '',
    `Cycle usage reminder: ${Number(cycleUsedHours || 0).toFixed(1)} hrs out of 70 hrs.`,
    logSheets?.length ? `Log sheets prepared for ${logSheets.length} day(s).` : '',
  ].filter(Boolean);
  const activeCommand = commandDeck.length ? commandDeck[commandIndex % commandDeck.length] : '';

  const panelContent = (
    <>
      <div className="px-4 pb-3 shrink-0">
        <SegmentTabs activeTab={activeTab} onChange={setActiveTab} />
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-5">
        {!route && !loading && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Enter trip details and plan to preview route, stops, and logs.
          </p>
        )}
        {activeTab === 'stops' ? (
          <StopsList
            stops={stopsAndRests || []}
            selectedIndex={selectedStopIndex}
            onSelect={setSelectedStopIndex}
          />
        ) : (
          <LogsPanel
            logSheets={logSheets || []}
            route={route}
            currentCycleUsedHours={cycleUsedHours}
          />
        )}
      </div>
    </>
  );

  const leftPanel = (
    <div className="flex flex-col h-full overflow-hidden bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700">
      <div className="p-4 shrink-0 border-b border-gray-100 dark:border-gray-800 bg-white/85 dark:bg-gray-900/85 backdrop-blur-sm">
        <TripForm
          onSubmit={handlePlan}
          onClear={handleClear}
          loading={loading}
          collapseAfterSubmit
        />
      </div>
      {error && (
        <div className="mx-4 mt-2 p-2.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm transition-opacity duration-200">
          {error}
        </div>
      )}
      {panelContent}
    </div>
  );

  const mapArea = (
    <div className="w-full h-full relative">
      <MapView
        route={route}
        mode={mode}
        selectedStop={selectedStop}
        stops={stopsAndRests || []}
        selectedStopIndex={selectedStopIndex}
      />
      {loading && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 dark:bg-gray-900/70 backdrop-blur-[2px]"
          aria-label="Loading route"
        >
          <div className="flex flex-col items-center gap-2">
            <div className="w-9 h-9 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Planning route...</span>
          </div>
        </div>
      )}
      {route && !loading && mode === 'plan' && !isMobile && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20">
          <button
            type="button"
            onClick={() => setMode('start')}
            className="rounded-full bg-primary text-white px-6 py-2.5 text-sm font-semibold shadow-[0_8px_26px_rgba(47,91,255,0.35)] hover:bg-primary/90 transition-all duration-200"
          >
            Start
          </button>
        </div>
      )}
      {route && mode === 'start' && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 w-[min(92%,720px)]">
          <div className="rounded-2xl border border-white/40 bg-white/75 dark:bg-gray-900/75 backdrop-blur-lg shadow-[0_10px_30px_rgba(0,0,0,0.22)] p-3">
            <p className="text-[11px] uppercase tracking-[0.12em] font-semibold text-primary dark:text-primary-dark mb-1">
              Live command
            </p>
            <p className="text-sm leading-5 text-gray-800 dark:text-gray-100 min-h-[40px]">
              {activeCommand || 'Follow the highlighted route to the next stop.'}
            </p>
            <div className="mt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setMode('plan')}
                className="rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-white/80 dark:hover:bg-gray-800"
              >
                Exit
              </button>
              <button
                type="button"
                onClick={() => setCommandIndex((prev) => prev + 1)}
                className="rounded-lg bg-primary/90 text-white px-3 py-1.5 text-xs font-semibold hover:bg-primary"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
        <div className="flex-1 relative min-h-0">
          <div className="absolute inset-0">{mapArea}</div>
          {mode === 'plan' && (
            <div className="absolute top-3 left-3 right-3 z-10">
              <div className="rounded-xl bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border border-gray-200/80 dark:border-gray-700 shadow-[0_8px_24px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.35)] p-3 transition-shadow duration-200">
                <TripForm
                  onSubmit={handlePlan}
                  onClear={handleClear}
                  loading={loading}
                  collapseAfterSubmit
                />
                {error && (
                  <div className="mt-2 p-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-xs">
                    {error}
                  </div>
                )}
              </div>
            </div>
          )}
          <BottomSheet
            stops={stopsAndRests}
            logSheets={logSheets}
            route={route}
            currentCycleUsedHours={cycleUsedHours}
            loading={loading}
            selectedStopIndex={selectedStopIndex}
            onSelectStop={setSelectedStopIndex}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            showStart={Boolean(route && !loading && mode === 'plan')}
            onStart={() => setMode('start')}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-gray-50 dark:bg-gray-950">
      <div
        className="shrink-0 overflow-hidden"
        style={{ width: `${leftWidthPercent}%` }}
      >
        {leftPanel}
      </div>
      <div
        role="separator"
        aria-label="Resize panels"
        onMouseDown={handleMouseDown}
        className="w-1 shrink-0 bg-gray-200 dark:bg-gray-700 hover:bg-primary/20 cursor-col-resize transition-colors duration-150"
      />
      <div className="flex-1 min-w-0 relative">
        {mapArea}
      </div>
    </div>
  );
}
