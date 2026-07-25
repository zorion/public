// Elevation-data plumbing that is pure logic: pixel decoding, bilinear
// sampling over decoded grids, tile/zoom policy, and ICGC GetFeatureInfo
// URL building/parsing. Fetching and canvas decoding live in providers.js.

import { lonLatToTile } from './geo.js';

// ICGC "contextmaps-terreny-5m-rgb": Mapbox terrain-rgb encoding, 512-px
// tiles, zooms 7–14, Catalonia only, CC BY 4.0 ICGC.
export const ICGC_TILE = {
  urlTemplate: 'https://geoserveis.icgc.cat/servei/catalunya/contextmaps-terreny-5m-rgb/wmts/{z}/{x}/{y}.png',
  tileSizePx: 512,
  minZoom: 7,
  maxZoom: 14,
  decode: decodeMapboxRGB,
};

// AWS Terrain Tiles (terrarium): 256-px tiles, worldwide (EU-DEM ~25 m here).
export const TERRARIUM_TILE = {
  urlTemplate: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
  tileSizePx: 256,
  minZoom: 0,
  maxZoom: 15,
  decode: decodeTerrarium,
};

// ICGC 1-m surface model (buildings + vegetation), reachable point-by-point
// through WMS GetFeatureInfo only.
export const ICGC_DSM_LAYER = 'model-superficies-catalunya-correlacio-1m-2024';
const ICGC_WMS = 'https://geoserveis.icgc.cat/servei/catalunya/elevacions-territorial/wms';

export function decodeMapboxRGB(r, g, b) {
  return -10000 + (r * 65536 + g * 256 + b) * 0.1;
}

export function decodeTerrarium(r, g, b) {
  return r * 256 + g + b / 256 - 32768;
}

// Rough Catalonia coverage box for the ICGC tiles.
export function inCatalonia(latDeg, lonDeg) {
  return latDeg >= 40.5 && latDeg <= 42.95 && lonDeg >= 0.1 && lonDeg <= 3.4;
}

// Zoom by target distance: fine detail only matters near the observer.
export function zoomForDistance(distanceM) {
  if (distanceM < 8000) return 13;
  if (distanceM < 40000) return 11;
  return 9;
}

export function tileUrl(source, z, x, y) {
  return source.urlTemplate
    .replace('{z}', z).replace('{x}', x).replace('{y}', y);
}

// Bilinear height from a decoded grid {sizePx, data: Float32Array} covering
// one tile, at fractional pixel coordinates. NaN cells mean nodata.
export function bilinear(grid, px, py) {
  const n = grid.sizePx;
  const x = Math.min(Math.max(px, 0), n - 1.001);
  const y = Math.min(Math.max(py, 0), n - 1.001);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const h00 = grid.data[y0 * n + x0];
  const h10 = grid.data[y0 * n + x0 + 1];
  const h01 = grid.data[(y0 + 1) * n + x0];
  const h11 = grid.data[(y0 + 1) * n + x0 + 1];
  const h = h00 * (1 - fx) * (1 - fy) + h10 * fx * (1 - fy) +
    h01 * (1 - fx) * fy + h11 * fx * fy;
  return Number.isNaN(h) ? null : h;
}

// Height at (lat, lon) via `loadGrid(source, z, x, y) → grid|null` (async,
// caching is the loader's business). Falls back ICGC → terrarium → null.
export async function sampleHeight(loadGrid, latDeg, lonDeg, distanceM) {
  let z = zoomForDistance(distanceM);
  const sources = inCatalonia(latDeg, lonDeg)
    ? [ICGC_TILE, TERRARIUM_TILE]
    : [TERRARIUM_TILE];
  for (const source of sources) {
    const zz = Math.min(Math.max(z, source.minZoom), source.maxZoom);
    const t = lonLatToTile(lonDeg, latDeg, zz);
    const tx = Math.floor(t.x);
    const ty = Math.floor(t.y);
    const grid = await loadGrid(source, zz, tx, ty);
    if (!grid) continue;
    const h = bilinear(grid, (t.x - tx) * grid.sizePx, (t.y - ty) * grid.sizePx);
    if (h !== null && h > -450 && h < 9000) return h;
  }
  return null;
}

// One-point surface-model query (WMS 1.3.0 GetFeatureInfo, EPSG:4326 —
// BBOX axis order is lat,lon). Returns the URL; the caller fetches.
export function gfiUrl(latDeg, lonDeg, layer = ICGC_DSM_LAYER) {
  const d = 0.001;
  const r = v => String(Math.round(v * 1e7) / 1e7);
  const params = new URLSearchParams({
    SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetFeatureInfo',
    LAYERS: layer, QUERY_LAYERS: layer, CRS: 'EPSG:4326',
    BBOX: [r(latDeg - d), r(lonDeg - d), r(latDeg + d), r(lonDeg + d)].join(','),
    WIDTH: '101', HEIGHT: '101', I: '50', J: '50',
    INFO_FORMAT: 'application/json', STYLES: '', FORMAT: 'image/png',
  });
  return `${ICGC_WMS}?${params}`;
}

// Height in meters out of a GetFeatureInfo GeoJSON response, or null.
export function parseGfi(json) {
  const f = json && json.features && json.features[0];
  if (!f || !f.properties) return null;
  const v = parseFloat(f.properties['Elevació'] ?? f.properties.elevacio);
  return Number.isFinite(v) ? v : null;
}
