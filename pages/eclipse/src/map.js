// Slippy-map view math for the location picker, plus Nominatim query building
// and response parsing. Pure functions, no DOM and no I/O: the canvas drawing
// and pointer handling live in mapview.js, the fetching in providers.js.

import { lonLatToTile, tileToLonLat, normalizeDeg } from './geo.js';
import { positiveRegion } from './contour.js';
import { DEFAULT_LANG } from './i18n.js';

// OpenStreetMap standard tiles. Their usage policy covers light,
// browser-driven traffic like this picker, and requires the attribution the
// page shows under the map.
export const OSM_TILE = {
  urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  tileSizePx: 256,
  minZoom: 3,
  maxZoom: 19,
};

// The pixel math below is in units of the basemap's tile size.
const TILE_PX = OSM_TILE.tileSizePx;

// Web mercator is undefined at the poles; clamping the center keeps the view
// out of that strip.
const MAX_LAT = 85.05112878;

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
export const GEOCODE_LIMIT = 6;

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const wrapLon = lon => normalizeDeg(lon + 180) - 180;

// A View is the map's whole state: geographic center, integer zoom level, and
// viewport size in CSS pixels. Every function here returns a new View.
export function makeView({ lat, lon, zoom, widthPx, heightPx }) {
  return {
    lat: clamp(lat, -MAX_LAT, MAX_LAT),
    lon: wrapLon(lon),
    zoom: clamp(Math.round(zoom), OSM_TILE.minZoom, OSM_TILE.maxZoom),
    widthPx,
    heightPx,
  };
}

export function resizeView(view, widthPx, heightPx) {
  return { ...view, widthPx, heightPx };
}

export function centerOn(view, latDeg, lonDeg, zoom = view.zoom) {
  return makeView({ ...view, lat: latDeg, lon: lonDeg, zoom });
}

// Width of the whole world at a zoom level, in pixels — mercator is square, so
// this is the height too.
const worldSizePx = zoom => TILE_PX * 2 ** zoom;

function worldPx(zoom, latDeg, lonDeg) {
  const t = lonLatToTile(lonDeg, clamp(latDeg, -MAX_LAT, MAX_LAT), zoom);
  return { x: t.x * TILE_PX, y: t.y * TILE_PX };
}

export function lonLatToViewPx(view, latDeg, lonDeg) {
  const center = worldPx(view.zoom, view.lat, view.lon);
  const point = worldPx(view.zoom, latDeg, lonDeg);
  const world = worldSizePx(view.zoom);
  // Take the short way around the antimeridian, so a point just across it
  // draws beside the view instead of a world away.
  let dx = point.x - center.x;
  if (dx > world / 2) dx -= world;
  if (dx < -world / 2) dx += world;
  return { x: dx + view.widthPx / 2, y: point.y - center.y + view.heightPx / 2 };
}

export function viewPxToLonLat(view, xPx, yPx) {
  const center = worldPx(view.zoom, view.lat, view.lon);
  const world = worldSizePx(view.zoom);
  const wx = center.x + (xPx - view.widthPx / 2);
  const wy = clamp(center.y + (yPx - view.heightPx / 2), 0, world);
  const { lat, lon } = tileToLonLat(wx / TILE_PX, wy / TILE_PX, view.zoom);
  return { lat, lon: wrapLon(lon) };
}

// dx/dy are how far the map content moved under the pointer, so the center
// travels the opposite way.
export function panView(view, dxPx, dyPx) {
  const c = viewPxToLonLat(view, view.widthPx / 2 - dxPx, view.heightPx / 2 - dyPx);
  return makeView({ ...view, lat: c.lat, lon: c.lon });
}

// Zoom by whole levels, keeping whatever is under `anchorPx` in place (the
// cursor for wheel zoom, the pinch midpoint for touch).
export function zoomView(view, dz, anchorPx = null) {
  const zoom = clamp(view.zoom + dz, OSM_TILE.minZoom, OSM_TILE.maxZoom);
  if (zoom === view.zoom) return view;
  const anchor = anchorPx ?? { x: view.widthPx / 2, y: view.heightPx / 2 };
  const held = viewPxToLonLat(view, anchor.x, anchor.y);
  const zoomed = { ...view, zoom };
  const after = lonLatToViewPx(zoomed, held.lat, held.lon);
  return panView(zoomed, anchor.x - after.x, anchor.y - after.y);
}

// The tiles covering the viewport, each with the pixel position to draw it at.
// x wraps around the world; y is clamped, so near the poles the list is short.
export function visibleTiles(view) {
  const n = 2 ** view.zoom;
  const center = lonLatToTile(view.lon, view.lat, view.zoom);
  const halfW = view.widthPx / 2 / TILE_PX;
  const halfH = view.heightPx / 2 / TILE_PX;
  const tiles = [];
  for (let ty = Math.floor(center.y - halfH); ty <= Math.floor(center.y + halfH); ty++) {
    if (ty < 0 || ty >= n) continue;
    for (let tx = Math.floor(center.x - halfW); tx <= Math.floor(center.x + halfW); tx++) {
      tiles.push({
        z: view.zoom,
        x: ((tx % n) + n) % n,
        y: ty,
        screenX: (tx - center.x) * TILE_PX + view.widthPx / 2,
        screenY: (ty - center.y) * TILE_PX + view.heightPx / 2,
      });
    }
  }
  return tiles;
}

export function viewBounds(view) {
  const nw = viewPxToLonLat(view, 0, 0);
  const se = viewPxToLonLat(view, view.widthPx, view.heightPx);
  const spansWorld = view.widthPx >= worldSizePx(view.zoom);
  return {
    west: spansWorld ? -180 : nw.lon,
    east: spansWorld ? 180 : se.lon,
    south: se.lat,
    north: nw.lat,
  };
}

// Where `field(latDeg, lonDeg)` comes out positive, as polygons and outline
// segments in the view's own pixels — for drawing an area that is defined by a
// calculation rather than by a boundary anyone has tabulated.
//
// Sampling on a pixel grid rather than a geographic one ties the detail to what
// can actually be seen: the same effort resolves the area to a few pixels
// whether the view spans a street or a continent. `padFraction` of the viewport
// is sampled beyond each edge, so a caller can pan that far before re-tracing.
export function traceFieldOnView(view, field, stepPx, padFraction) {
  const x0 = -view.widthPx * padFraction;
  const y0 = -view.heightPx * padFraction;
  const cols = Math.ceil((view.widthPx - 2 * x0) / stepPx);
  const rows = Math.ceil((view.heightPx - 2 * y0) / stepPx);
  const pxOf = (gx, gy) => ({ x: x0 + gx * stepPx, y: y0 + gy * stepPx });

  const values = new Float64Array((cols + 1) * (rows + 1));
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      const p = pxOf(i, j);
      const c = viewPxToLonLat(view, p.x, p.y);
      values[j * (cols + 1) + i] = field(c.lat, c.lon);
    }
  }

  const { fills, edges } = positiveRegion(values, cols, rows);
  const toPx = v => pxOf(v.x, v.y);
  return { fills: fills.map(poly => poly.map(toPx)), edges: edges.map(seg => seg.map(toPx)) };
}

// Forward-geocoding URL. The current viewport is passed as `viewbox` to bias
// ranking without excluding anything: unbiased, "Montsec" answers with a
// village in France long before the Catalan range. `lang` only picks which of
// Nominatim's names comes back, never which places do.
export function geocodeUrl(query, view = null, lang = DEFAULT_LANG) {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: String(GEOCODE_LIMIT),
  });
  params.set('accept-language', lang);
  if (view) {
    const b = viewBounds(view);
    const r = v => v.toFixed(4);
    params.set('viewbox', [r(b.west), r(b.south), r(b.east), r(b.north)].join(','));
  }
  return `${NOMINATIM_URL}?${params}`;
}

// Nominatim results reduced to what the picker needs. `name` is the bare place
// name and `label` its full context, so the list can show both.
export function parseGeocode(json) {
  if (!Array.isArray(json)) return [];
  return json
    .map(r => ({
      lat: parseFloat(r?.lat),
      lon: parseFloat(r?.lon),
      name: r?.name || (r?.display_name ?? '').split(',')[0].trim(),
      label: r?.display_name ?? '',
    }))
    .filter(r => Number.isFinite(r.lat) && Number.isFinite(r.lon) &&
      r.lat >= -90 && r.lat <= 90 && r.lon >= -180 && r.lon <= 180);
}
