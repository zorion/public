// Shareable-URL encoding of a viewing spot: ?lat=…&lon=…[&h=…]
// Pure string↔state mapping; the browser wiring lives in app.js.

// Location fields from a query string, or null when absent/invalid.
export function parseShareParams(search) {
  const q = new URLSearchParams(search);
  const lat = parseFloat(q.get('lat'));
  const lon = parseFloat(q.get('lon'));
  const h = parseFloat(q.get('h'));
  const valid = Number.isFinite(lat) && Number.isFinite(lon) &&
    lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
  return {
    lat: valid ? lat : null,
    lon: valid ? lon : null,
    extraHeightM: Number.isFinite(h) && h > 0 ? Math.min(h, 500) : 0,
  };
}

// Query string for the current spot. Height is omitted when zero so plain
// ground-level links stay short.
export function shareQuery({ lat, lon, extraHeightM }) {
  const q = new URLSearchParams();
  q.set('lat', String(lat));
  q.set('lon', String(lon));
  if (extraHeightM > 0) q.set('h', String(extraHeightM));
  return q.toString();
}
