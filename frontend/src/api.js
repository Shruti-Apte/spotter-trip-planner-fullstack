const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const mapboxToken = (import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || '').trim();

export async function planTrip(payload) {
  const requestPayload = mapboxToken ? { ...payload, mapbox_token: mapboxToken } : payload;
  const res = await fetch(`${baseUrl}/api/plan/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestPayload),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || 'Request failed');
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function fetchPlaceSuggestions(query) {
  const q = `${query || ''}`.trim();
  if (q.length < 2) return [];
  const tokenQuery = mapboxToken ? `&mapbox_token=${encodeURIComponent(mapboxToken)}` : '';
  const res = await fetch(`${baseUrl}/api/places/?q=${encodeURIComponent(q)}${tokenQuery}`);
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || 'Failed to fetch suggestions');
    err.status = res.status;
    throw err;
  }
  return data.suggestions || [];
}
