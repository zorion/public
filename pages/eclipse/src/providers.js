// Browser-side data access: tile fetching + PNG decoding via canvas,
// GetFeatureInfo point queries, basemap images and place-name search.
// Everything cached per session. This is the only module that touches the
// network; all logic lives in heights.js and map.js.

import { tileUrl, gfiUrl, parseGfi } from './heights.js';
import { geocodeUrl, parseGeocode } from './map.js';

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

// Panning is cheap enough to visit thousands of tiles in a session, so unlike
// the elevation caches this one is bounded. The viewport needs a few dozen
// tiles, so eviction never touches anything on screen.
const MAX_CACHED_TILES = 512;

// Basemap tile source for the picker: plain <img> loading, since these tiles
// are only ever drawn, never read back pixel by pixel. `peek` is the
// synchronous lookup the canvas draws from; `load` fetches and is
// concurrent-dedup'd. A failed tile resolves to null and just stays blank.
export function makeTileImageSource(source) {
  const images = new Map(); // key → image, in insertion order
  const inFlight = new Map();
  const keyOf = (z, x, y) => `${z}/${x}/${y}`;

  function fetchImage(z, x, y) {
    return new Promise(resolve => {
      const img = new Image();
      img.addEventListener('load', () => resolve(img));
      img.addEventListener('error', () => resolve(null));
      img.src = tileUrl(source, z, x, y);
    });
  }

  return {
    peek(z, x, y) {
      return images.get(keyOf(z, x, y)) ?? null;
    },
    load(z, x, y) {
      const key = keyOf(z, x, y);
      if (images.has(key)) return Promise.resolve(images.get(key));
      if (!inFlight.has(key)) {
        inFlight.set(key, fetchImage(z, x, y).then(img => {
          inFlight.delete(key);
          if (img) {
            images.set(key, img);
            while (images.size > MAX_CACHED_TILES) {
              images.delete(images.keys().next().value);
            }
          }
          return img;
        }));
      }
      return inFlight.get(key);
    },
  };
}

// Place-name search. Called once per explicit search and never per keystroke,
// which is what the Nominatim usage policy asks for.
export async function geocode(query, view, lang) {
  const resp = await fetch(geocodeUrl(query, view, lang));
  if (!resp.ok) return [];
  return parseGeocode(await resp.json());
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
