// Shareable-URL encoding of a viewing spot: ?lat=…&lon=…[&h=…][&lang=…]
// Pure string↔state mapping; the browser wiring lives in app.js.

import { DEFAULT_LANG, normalizeLang } from './i18n.js';

// Location fields from a query string, or null when absent/invalid. The language
// is read whatever the coordinates turn out to be: ?lang=ca on its own is a
// perfectly good request for the Catalan page at the default spot.
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
    lang: normalizeLang(q.get('lang')),
  };
}

// Query string for the current spot. Height and language are omitted at their
// defaults, so a plain ground-level Spanish link stays as short as it ever was —
// and so the page rewriting its own URL never invents a lang= that the visitor
// did not ask for.
export function shareQuery({ lat, lon, extraHeightM, lang }) {
  const q = new URLSearchParams();
  q.set('lat', String(lat));
  q.set('lon', String(lon));
  if (extraHeightM > 0) q.set('h', String(extraHeightM));
  if (lang && lang !== DEFAULT_LANG) q.set('lang', lang);
  return q.toString();
}
