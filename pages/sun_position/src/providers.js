// Browser-side data access: tile fetching + PNG decoding via canvas, and
// GetFeatureInfo point queries. Everything cached per session. This is the
// only module that touches the network; all logic lives in heights.js.

import { tileUrl, gfiUrl, parseGfi } from './heights.js';

// loadGrid(source, z, x, y) → {sizePx, data: Float32Array}|null, cached,
// concurrent-dedup'd. Transparent pixels (nodata outside ICGC coverage)
// decode to NaN so bilinear() reports them as missing.
export function makeGridLoader(onProgress = () => {}) {
  const cache = new Map();
  let fetched = 0;
  return function loadGrid(source, z, x, y) {
    const key = `${source.urlTemplate}|${z}/${x}/${y}`;
    if (!cache.has(key)) {
      cache.set(key, fetchGrid(source, z, x, y)
        .catch(() => null)
        .then(grid => {
          onProgress(++fetched);
          return grid;
        }));
    }
    return cache.get(key);
  };
}

async function fetchGrid(source, z, x, y) {
  const resp = await fetch(tileUrl(source, z, x, y));
  if (!resp.ok) return null;
  const bitmap = await createImageBitmap(await resp.blob());
  const n = bitmap.width;
  const canvas = new OffscreenCanvas(n, n);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  const rgba = ctx.getImageData(0, 0, n, n).data;
  const data = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) {
    data[i] = rgba[i * 4 + 3] === 0
      ? NaN
      : source.decode(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
  }
  return { sizePx: n, data };
}

// Surface-model point sampler (1 m DSM via GetFeatureInfo), cached on a
// ~1 m rounding of the coordinates.
export function makeSurfaceSampler() {
  const cache = new Map();
  return function sampleSurface(latDeg, lonDeg) {
    const key = `${latDeg.toFixed(5)},${lonDeg.toFixed(5)}`;
    if (!cache.has(key)) {
      cache.set(key, fetch(gfiUrl(latDeg, lonDeg))
        .then(r => (r.ok ? r.json() : null))
        .then(j => (j ? parseGfi(j) : null))
        .catch(() => null));
    }
    return cache.get(key);
  };
}
