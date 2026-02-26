import { useEffect, useMemo, useRef, useState } from 'react';
import Map, { Source, Layer, Marker, NavigationControl, Popup } from 'react-map-gl';
import { BedDouble, Coffee, Flag, Fuel, House, MapPin, Truck } from 'lucide-react';
import 'mapbox-gl/dist/mapbox-gl.css';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

const DEFAULT_VIEW = {
  longitude: -98,
  latitude: 39,
  zoom: 3,
};

const LEG_COLORS = ['#2F5BFF', '#5B8AFF'];

function getRouteGeoJSON(geometry) {
  if (!geometry || geometry.length < 2) return null;
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: geometry,
    },
  };
}

function getBounds(geometry) {
  return geometry.reduce(
    (acc, coord) => {
      acc[0] = Math.min(acc[0], coord[0]);
      acc[1] = Math.min(acc[1], coord[1]);
      acc[2] = Math.max(acc[2], coord[0]);
      acc[3] = Math.max(acc[3], coord[1]);
      return acc;
    },
    [geometry[0][0], geometry[0][1], geometry[0][0], geometry[0][1]]
  );
}

function getToneClasses(tone) {
  switch (tone) {
    case 'start':
      return 'text-primary dark:text-primary-dark';
    case 'pickup':
      return 'text-amber-600 dark:text-amber-400';
    case 'dropoff':
      return 'text-cyan-600 dark:text-cyan-400';
    case 'rest':
      return 'text-emerald-600 dark:text-emerald-400';
    case 'fuel':
      return 'text-violet-600 dark:text-violet-400';
    default:
      return 'text-slate-600 dark:text-slate-300';
  }
}

function WaypointIcon({ Icon, tone, title, active }) {
  return (
    <div
      className={`flex items-center justify-center rounded-full min-w-[34px] min-h-[34px] w-[34px] h-[34px] transition-all duration-200 bg-white/95 dark:bg-gray-900/95 border border-gray-200/90 dark:border-gray-700 shadow-[0_8px_20px_rgba(15,23,42,0.22)] ${
        active ? 'ring-2 ring-primary/45 dark:ring-primary-dark/55 scale-105' : ''
      }`}
      title={title}
    >
      <Icon className={`h-[16px] w-[16px] ${getToneClasses(tone)}`} strokeWidth={2.2} />
    </div>
  );
}

function StopRestIcon({ Icon, tone, title, active }) {
  return (
    <div
      className={`flex items-center justify-center rounded-full h-7 w-7 transition-all duration-200 bg-white/95 dark:bg-gray-900/95 border border-gray-200/90 dark:border-gray-700 shadow-[0_6px_16px_rgba(15,23,42,0.18)] ${
        active ? 'ring-2 ring-primary/40 dark:ring-primary-dark/55 scale-105' : ''
      }`}
      title={title}
    >
      <Icon className={`h-[13px] w-[13px] ${getToneClasses(tone)}`} strokeWidth={2.2} />
    </div>
  );
}

function getStopKind(stop) {
  const text = `${stop?.description || ''} ${stop?.status || ''}`.toLowerCase();
  if (text.includes('pickup')) return 'pickup';
  if (text.includes('dropoff')) return 'dropoff';
  if (text.includes('fuel')) return 'fuel';
  if (text.includes('break') || text.includes('rest') || text.includes('sleeper') || text.includes('off duty')) return 'rest';
  return 'other';
}

function getStopMarkerDetails(stop) {
  const kind = getStopKind(stop);
  const description = `${stop?.description || ''}`.toLowerCase();
  const status = `${stop?.status || ''}`.toLowerCase();
  const durationMin = Number(stop?.duration_minutes || 0);

  if (kind === 'pickup') return { kind, Icon: Truck, tone: 'pickup', title: 'Pickup location' };
  if (kind === 'dropoff') return { kind, Icon: Flag, tone: 'dropoff', title: 'Dropoff location' };
  if (kind === 'fuel') return { kind, Icon: Fuel, tone: 'fuel', title: 'Fuel stop' };
  if (kind === 'rest') {
    const isLongRest = durationMin >= 8 * 60 || status.includes('sleeper') || description.includes('10-hour rest');
    if (isLongRest) return { kind, Icon: BedDouble, tone: 'rest', title: 'Long rest stop' };
    return { kind, Icon: Coffee, tone: 'rest', title: 'Short rest stop' };
  }
  return { kind, Icon: MapPin, tone: 'other', title: 'Stop' };
}

export default function MapView({
  route,
  mode = 'plan',
  selectedStop,
  stops = [],
  selectedStopIndex = null,
}) {
  const mapRef = useRef(null);
  const [drawProgress, setDrawProgress] = useState(1);
  const animationRef = useRef(null);
  const [isTouchMode, setIsTouchMode] = useState(false);
  const [openTooltip, setOpenTooltip] = useState(null);
  const [clickedMarkerId, setClickedMarkerId] = useState(null);

  const navControlStyle = useMemo(() => {
    // On mobile, the trip form sits as a top overlay in plan mode.
    // Push the map controls down so zoom/compass stays clickable.
    if (!isTouchMode) return undefined;
    return {
      marginTop: mode === 'plan' ? 120 : 76,
      marginRight: 12,
    };
  }, [isTouchMode, mode]);

  const routeSignature = useMemo(() => {
    if (!route?.geometry?.length) return 'none';
    const first = route.geometry[0];
    const last = route.geometry[route.geometry.length - 1];
    return `${route.geometry.length}:${first?.join(',')}:${last?.join(',')}`;
  }, [route?.geometry]);

  const waypoints = route?.waypoints && route.waypoints.length >= 3 ? route.waypoints : null;
  const legsWithGeometry = route?.legs?.filter((leg) => leg.geometry?.length >= 2) ?? [];
  const hasLegs = legsWithGeometry.length >= 2;
  const fallbackRouteGeoJSON = route?.geometry && !hasLegs ? getRouteGeoJSON(route.geometry) : null;
  const fullRouteGeoJSON = route?.geometry ? getRouteGeoJSON(route.geometry) : null;

  const selectedStopKind = getStopKind(selectedStop);
  const selectedStopCoord = selectedStop?.coordinates;
  const markerConfig = waypoints
    ? [
        { key: 'start', coord: waypoints[0], Icon: House, tone: 'start', title: 'Current location' },
        { key: 'pickup', coord: waypoints[1], Icon: Truck, tone: 'pickup', title: 'Pickup location' },
        { key: 'dropoff', coord: waypoints[2], Icon: Flag, tone: 'dropoff', title: 'Dropoff location' },
      ]
    : route?.geometry
      ? [
          { key: 'start', coord: route.geometry[0], Icon: House, tone: 'start', title: 'Current location' },
          { key: 'dropoff', coord: route.geometry[route.geometry.length - 1], Icon: Flag, tone: 'dropoff', title: 'Dropoff location' },
        ]
      : [];
  const stopMarkers = (stops || [])
    .map((stop, idx) => {
      const coords = stop?.coordinates;
      if (!coords || coords.length < 2) return null;
      const details = getStopMarkerDetails(stop);
      // Waypoints are rendered with dedicated markers.
      if (details.kind === 'pickup' || details.kind === 'dropoff') return null;
      return {
        key: `${details.kind}-${idx}`,
        coord: coords,
        Icon: details.Icon,
        tone: details.tone,
        title: stop.description || details.title || details.kind,
        active: idx === selectedStopIndex,
      };
    })
    .filter(Boolean);

  const fitRouteView = (map, withAnimation = true) => {
    if (!route?.geometry || route.geometry.length < 2) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const bounds = getBounds(route.geometry);
    const padding = mode === 'start'
      ? { top: 120, right: 56, bottom: 140, left: 56 }
      : { top: 80, right: 80, bottom: 80, left: 80 };

    map.fitBounds(bounds, {
      padding,
      maxZoom: 14,
      duration: withAnimation && !reducedMotion ? 900 : 0,
      essential: true,
    });

    if (withAnimation && !reducedMotion) {
      window.setTimeout(() => {
        map.easeTo({
          pitch: mode === 'start' ? 45 : 35,
          bearing: 8,
          duration: 650,
          essential: true,
        });
      }, 760);
    }
  };

  useEffect(() => {
    const media = window.matchMedia('(hover: none), (pointer: coarse)');
    const update = () => setIsTouchMode(media.matches);
    update();
    if (media.addEventListener) {
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  useEffect(() => {
    if (!mapRef.current || !route?.geometry || route.geometry.length < 2) return undefined;

    const map = mapRef.current.getMap();
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    fitRouteView(map, true);

    setDrawProgress(reducedMotion ? 1 : 0);

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    if (reducedMotion) return undefined;

    const animationDelay = 900;
    const animationDuration = 1500;
    const startAt = performance.now() + animationDelay;

    const tick = (now) => {
      if (now < startAt) {
        animationRef.current = requestAnimationFrame(tick);
        return;
      }
      const elapsed = now - startAt;
      const p = Math.min(1, elapsed / animationDuration);
      setDrawProgress(p);
      if (p < 1) animationRef.current = requestAnimationFrame(tick);
    };

    animationRef.current = requestAnimationFrame(tick);
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [routeSignature, mode, route?.geometry]);

  useEffect(() => {
    if (!mapRef.current || !selectedStopCoord || selectedStopCoord.length < 2) return;
    const map = mapRef.current.getMap();
    const nextZoom = Math.max(map.getZoom(), 11);
    map.easeTo({
      center: selectedStopCoord,
      zoom: nextZoom,
      duration: 650,
      essential: true,
    });
  }, [selectedStopCoord?.[0], selectedStopCoord?.[1]]);

  const handleMarkerEnter = (id, coord, title) => {
    if (isTouchMode) return;
    setOpenTooltip({ id, coord, title });
  };

  const handleMarkerLeave = (id) => {
    if (isTouchMode) return;
    setOpenTooltip((prev) => (prev?.id === id ? null : prev));
  };

  const handleMarkerClick = (id, coord, title) => {
    if (!coord || !mapRef.current) return;
    const map = mapRef.current.getMap();
    const isSecondClick = clickedMarkerId === id;

    if (isSecondClick) {
      setClickedMarkerId(null);
      setOpenTooltip(null);
      fitRouteView(map, true);
      return;
    }

    const nextZoom = Math.max(map.getZoom(), 12.5);
    map.easeTo({
      center: coord,
      zoom: nextZoom,
      duration: 650,
      essential: true,
    });
    setClickedMarkerId(id);
    setOpenTooltip({ id, coord, title });
  };

  if (!MAPBOX_TOKEN) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-sm">
        Map not configured. Set VITE_MAPBOX_ACCESS_TOKEN in .env
      </div>
    );
  }

  return (
    <div className="w-full h-full relative">
      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={DEFAULT_VIEW}
        mapStyle="mapbox://styles/mapbox/navigation-day-v1"
        style={{ width: '100%', height: '100%' }}
        onClick={() => {
          if (isTouchMode) {
            setOpenTooltip(null);
            setClickedMarkerId(null);
          }
        }}
      >
        <NavigationControl position="top-right" style={navControlStyle} />
        {hasLegs
          ? legsWithGeometry.map((leg, i) => {
              const geojson = getRouteGeoJSON(leg.geometry);
              if (!geojson) return null;
              return (
                <Source key={`leg-${i}`} id={`route-leg-${i}`} type="geojson" data={geojson}>
                  <Layer
                    id={`route-line-leg-${i}`}
                    type="line"
                    paint={{
                      'line-color': LEG_COLORS[i] ?? LEG_COLORS[0],
                      'line-width': 4.5,
                      'line-opacity': 0.9,
                    }}
                  />
                </Source>
              );
            })
          : fallbackRouteGeoJSON && (
              <Source id="route" type="geojson" data={fallbackRouteGeoJSON}>
                <Layer
                  id="route-line"
                  type="line"
                  paint={{
                    'line-color': LEG_COLORS[0],
                    'line-width': 4.5,
                  }}
                />
              </Source>
            )}

        {fullRouteGeoJSON && (
          <Source id="route-glow" type="geojson" data={fullRouteGeoJSON} lineMetrics>
            <Layer
              id="route-glow-line"
              type="line"
              paint={{
                'line-width': 12,
                'line-opacity': 0.28,
                'line-gradient': [
                  'step',
                  ['line-progress'],
                  'rgba(0, 207, 232, 0)',
                  drawProgress,
                  'rgba(0, 207, 232, 0.58)',
                ],
              }}
            />
            <Layer
              id="route-draw-line"
              type="line"
              paint={{
                'line-width': 5,
                'line-gradient': [
                  'step',
                  ['line-progress'],
                  'rgba(0, 207, 232, 0)',
                  drawProgress,
                  'rgba(0, 207, 232, 0.96)',
                ],
              }}
            />
          </Source>
        )}

        {markerConfig.map(({ key, coord, Icon, tone, title }) => {
          if (!coord || coord.length < 2) return null;
          const active = key === selectedStopKind || (selectedStopKind === 'other' && key === 'start');
          const markerId = `waypoint-${key}`;
          return (
            <Marker key={key} longitude={coord[0]} latitude={coord[1]} anchor="bottom">
              <div
                role="button"
                tabIndex={0}
                aria-label={title}
                className="cursor-pointer touch-manipulation"
                onMouseEnter={() => handleMarkerEnter(markerId, coord, title)}
                onMouseLeave={() => handleMarkerLeave(markerId)}
                onClick={(e) => {
                  e.stopPropagation();
                  handleMarkerClick(markerId, coord, title);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.stopPropagation();
                    handleMarkerClick(markerId, coord, title);
                  }
                }}
              >
                <WaypointIcon Icon={Icon} tone={tone} title={title} active={active} />
              </div>
            </Marker>
          );
        })}
        {stopMarkers.map(({ key, coord, Icon, tone, title, active }) => (
          <Marker key={key} longitude={coord[0]} latitude={coord[1]} anchor="center">
            <div
              role="button"
              tabIndex={0}
              aria-label={title}
              className="cursor-pointer touch-manipulation"
              onMouseEnter={() => handleMarkerEnter(key, coord, title)}
              onMouseLeave={() => handleMarkerLeave(key)}
              onClick={(e) => {
                e.stopPropagation();
                handleMarkerClick(key, coord, title);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.stopPropagation();
                  handleMarkerClick(key, coord, title);
                }
              }}
            >
              <StopRestIcon Icon={Icon} tone={tone} title={title} active={active} />
            </div>
          </Marker>
        ))}
        {openTooltip?.coord && (
          <Popup
            longitude={openTooltip.coord[0]}
            latitude={openTooltip.coord[1]}
            closeButton={false}
            closeOnClick={false}
            closeOnMove={false}
            anchor="top"
            offset={16}
            maxWidth="220px"
          >
            <div className="text-xs font-medium text-gray-800">{openTooltip.title}</div>
          </Popup>
        )}
      </Map>
    </div>
  );
}
