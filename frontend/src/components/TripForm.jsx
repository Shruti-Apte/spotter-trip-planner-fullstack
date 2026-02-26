import { useRef, useState, useCallback } from 'react';
import { fetchPlaceSuggestions } from '../api';

export const initialValues = {
  current_location: '',
  pickup_location: '',
  dropoff_location: '',
  current_cycle_used_hrs: '',
  current_location_coords: null,
  pickup_location_coords: null,
  dropoff_location_coords: null,
};

function validate(values) {
  const errors = {};
  if (!values.current_location?.trim()) errors.current_location = 'Current location is required';
  if (!values.pickup_location?.trim()) errors.pickup_location = 'Pickup location is required';
  if (!values.dropoff_location?.trim()) errors.dropoff_location = 'Dropoff location is required';
  const cycle = parseFloat(values.current_cycle_used_hrs);
  if (values.current_cycle_used_hrs === '' || isNaN(cycle) || cycle < 0 || cycle > 70) {
    errors.current_cycle_used_hrs = 'Hours used (0–70) is required';
  }
  return errors;
}

function truncate(s, max = 18) {
  if (!s) return '';
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

export default function TripForm({ onSubmit, onClear, loading, collapseAfterSubmit }) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [expanded, setExpanded] = useState(true);
  const [activeField, setActiveField] = useState(null);
  const [suggestions, setSuggestions] = useState({
    current_location: [],
    pickup_location: [],
    dropoff_location: [],
  });
  const [suggestionsLoading, setSuggestionsLoading] = useState({
    current_location: false,
    pickup_location: false,
    dropoff_location: false,
  });
  const debounceRef = useRef({});
  const requestIdRef = useRef({});

  const requestSuggestions = useCallback((field, query) => {
    if (!['current_location', 'pickup_location', 'dropoff_location'].includes(field)) return;
    if (debounceRef.current[field]) clearTimeout(debounceRef.current[field]);

    const term = `${query || ''}`.trim();
    if (term.length < 2) {
      setSuggestions((prev) => ({ ...prev, [field]: [] }));
      setSuggestionsLoading((prev) => ({ ...prev, [field]: false }));
      return;
    }

    debounceRef.current[field] = window.setTimeout(async () => {
      const reqId = (requestIdRef.current[field] || 0) + 1;
      requestIdRef.current[field] = reqId;
      setSuggestionsLoading((prev) => ({ ...prev, [field]: true }));
      try {
        const items = await fetchPlaceSuggestions(term);
        if (requestIdRef.current[field] === reqId) {
          setSuggestions((prev) => ({ ...prev, [field]: items }));
        }
      } catch {
        if (requestIdRef.current[field] === reqId) {
          setSuggestions((prev) => ({ ...prev, [field]: [] }));
        }
      } finally {
        if (requestIdRef.current[field] === reqId) {
          setSuggestionsLoading((prev) => ({ ...prev, [field]: false }));
        }
      }
    }, 220);
  }, []);

  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    setValues((prev) => ({
      ...prev,
      [name]: value,
      ...(name === 'current_location' ? { current_location_coords: null } : {}),
      ...(name === 'pickup_location' ? { pickup_location_coords: null } : {}),
      ...(name === 'dropoff_location' ? { dropoff_location_coords: null } : {}),
    }));
    if (name === 'current_location' || name === 'pickup_location' || name === 'dropoff_location') {
      setActiveField(name);
      requestSuggestions(name, value);
    }
    if (touched[name] && errors[name]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  }, [touched, errors, requestSuggestions]);

  const handleBlur = useCallback((e) => {
    const { name } = e.target;
    setTouched((prev) => ({ ...prev, [name]: true }));
    const nextErrors = validate({ ...values, [name]: e.target.value });
    if (nextErrors[name]) setErrors((prev) => ({ ...prev, [name]: nextErrors[name] }));
    else setErrors((prev) => { const n = { ...prev }; delete n[name]; return n; });
    if (name === 'current_location' || name === 'pickup_location' || name === 'dropoff_location') {
      window.setTimeout(() => {
        setActiveField((prev) => (prev === name ? null : prev));
      }, 120);
    }
  }, [values]);

  const handleSelectSuggestion = useCallback((field, item) => {
    const coordsKey = `${field}_coords`;
    setValues((prev) => ({
      ...prev,
      [field]: item?.name || prev[field],
      [coordsKey]: item?.coordinates || null,
    }));
    setSuggestions((prev) => ({ ...prev, [field]: [] }));
    setActiveField(null);
  }, []);

  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    setTouched({ current_location: true, pickup_location: true, dropoff_location: true, current_cycle_used_hrs: true });
    const nextErrors = validate(values);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    const payload = {
      current_location: values.current_location.trim(),
      pickup_location: values.pickup_location.trim(),
      dropoff_location: values.dropoff_location.trim(),
      current_cycle_used_hrs: parseFloat(values.current_cycle_used_hrs),
      current_location_coords: values.current_location_coords,
      pickup_location_coords: values.pickup_location_coords,
      dropoff_location_coords: values.dropoff_location_coords,
    };
    onSubmit(payload);
    if (collapseAfterSubmit) setExpanded(false);
  }, [values, onSubmit, collapseAfterSubmit]);

  const handleClear = useCallback(() => {
    setValues(initialValues);
    setErrors({});
    setTouched({});
    setSuggestions({
      current_location: [],
      pickup_location: [],
      dropoff_location: [],
    });
    setActiveField(null);
    onClear();
    setExpanded(true);
  }, [onClear]);

  const hasAnyValues = values.current_location?.trim() || values.pickup_location?.trim() || values.dropoff_location?.trim() || values.current_cycle_used_hrs !== '';

  const summary = hasAnyValues
    ? `${truncate(values.current_location) || 'Current'} → ${truncate(values.pickup_location) || 'Pickup'} → ${truncate(values.dropoff_location) || 'Dropoff'}${values.current_cycle_used_hrs !== '' ? ` · ${values.current_cycle_used_hrs}h used` : ''}`
    : 'Enter trip details';

  const inputClass = "w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none disabled:opacity-60";
  const labelClass = "block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1";
  const errorClass = "mt-0.5 text-xs text-red-600 dark:text-red-400";

  if (!expanded) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(true)}
        onKeyDown={(e) => e.key === 'Enter' && setExpanded(true)}
        className="flex items-center justify-between gap-2 py-2 px-3 rounded-xl bg-white dark:bg-gray-800/95 border border-gray-200 dark:border-gray-600 shadow-sm hover:shadow transition-shadow duration-200 cursor-pointer"
      >
        <span className="text-sm text-gray-700 dark:text-gray-200 truncate flex-1 min-w-0">{summary}</span>
        <span className="text-xs font-medium text-primary dark:text-primary-dark shrink-0">Edit</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Trip</span>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          disabled={loading}
          className="p-1 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-150 disabled:opacity-50"
          aria-label="Collapse"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        </button>
      </div>
      <div className="relative">
        <label htmlFor="current_location" className={labelClass}>Current location</label>
        <input
          id="current_location"
          name="current_location"
          type="text"
          value={values.current_location}
          onChange={handleChange}
          onBlur={handleBlur}
          onFocus={() => setActiveField('current_location')}
          placeholder="Address or city"
          className={inputClass}
          disabled={loading}
        />
        {activeField === 'current_location' && (
          <div className="absolute left-0 right-0 top-full mt-1 z-20 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg max-h-52 overflow-auto">
            {suggestionsLoading.current_location && (
              <p className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">Searching...</p>
            )}
            {!suggestionsLoading.current_location && suggestions.current_location.length === 0 && values.current_location.trim().length >= 2 && (
              <p className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">No matches</p>
            )}
            {suggestions.current_location.map((item, idx) => (
              <button
                key={`current-location-${idx}`}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelectSuggestion('current_location', item)}
                className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                {item.name}
              </button>
            ))}
          </div>
        )}
        {errors.current_location && <p className={errorClass}>{errors.current_location}</p>}
      </div>
      <div className="relative">
        <label htmlFor="pickup_location" className={labelClass}>Pickup</label>
        <input
          id="pickup_location"
          name="pickup_location"
          type="text"
          value={values.pickup_location}
          onChange={handleChange}
          onBlur={handleBlur}
          onFocus={() => setActiveField('pickup_location')}
          placeholder="Address or city"
          className={inputClass}
          disabled={loading}
        />
        {activeField === 'pickup_location' && (
          <div className="absolute left-0 right-0 top-full mt-1 z-20 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg max-h-52 overflow-auto">
            {suggestionsLoading.pickup_location && (
              <p className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">Searching...</p>
            )}
            {!suggestionsLoading.pickup_location && suggestions.pickup_location.length === 0 && values.pickup_location.trim().length >= 2 && (
              <p className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">No matches</p>
            )}
            {suggestions.pickup_location.map((item, idx) => (
              <button
                key={`pickup-location-${idx}`}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelectSuggestion('pickup_location', item)}
                className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                {item.name}
              </button>
            ))}
          </div>
        )}
        {errors.pickup_location && <p className={errorClass}>{errors.pickup_location}</p>}
      </div>
      <div className="relative">
        <label htmlFor="dropoff_location" className={labelClass}>Dropoff</label>
        <input
          id="dropoff_location"
          name="dropoff_location"
          type="text"
          value={values.dropoff_location}
          onChange={handleChange}
          onBlur={handleBlur}
          onFocus={() => setActiveField('dropoff_location')}
          placeholder="Address or city"
          className={inputClass}
          disabled={loading}
        />
        {activeField === 'dropoff_location' && (
          <div className="absolute left-0 right-0 top-full mt-1 z-20 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg max-h-52 overflow-auto">
            {suggestionsLoading.dropoff_location && (
              <p className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">Searching...</p>
            )}
            {!suggestionsLoading.dropoff_location && suggestions.dropoff_location.length === 0 && values.dropoff_location.trim().length >= 2 && (
              <p className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">No matches</p>
            )}
            {suggestions.dropoff_location.map((item, idx) => (
              <button
                key={`dropoff-location-${idx}`}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelectSuggestion('dropoff_location', item)}
                className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                {item.name}
              </button>
            ))}
          </div>
        )}
        {errors.dropoff_location && <p className={errorClass}>{errors.dropoff_location}</p>}
      </div>
      <div>
        <label htmlFor="current_cycle_used_hrs" className={labelClass}>Hours used (0–70)</label>
        <input
          id="current_cycle_used_hrs"
          name="current_cycle_used_hrs"
          type="number"
          min="0"
          max="70"
          step="0.5"
          value={values.current_cycle_used_hrs}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder="0"
          className={inputClass}
          disabled={loading}
        />
        {errors.current_cycle_used_hrs && <p className={errorClass}>{errors.current_cycle_used_hrs}</p>}
      </div>
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 rounded-lg bg-primary hover:bg-primary/90 text-white font-medium py-2 px-4 text-sm transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed focus:ring-2 focus:ring-primary/30 focus:outline-none"
        >
          {loading ? 'Planning…' : 'Plan trip'}
        </button>
        <button
          type="button"
          onClick={handleClear}
          disabled={loading}
          className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium py-2 px-4 text-sm transition-colors duration-150 disabled:opacity-60 focus:ring-2 focus:ring-gray-300 focus:outline-none"
        >
          Clear
        </button>
      </div>
    </form>
  );
}
