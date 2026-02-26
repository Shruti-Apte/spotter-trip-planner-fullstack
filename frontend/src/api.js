const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export async function planTrip(payload) {
  const res = await fetch(`${baseUrl}/api/plan/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
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
  const res = await fetch(`${baseUrl}/api/places/?q=${encodeURIComponent(q)}`);
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || 'Failed to fetch suggestions');
    err.status = res.status;
    throw err;
  }
  return data.suggestions || [];
}
