// The location picker: an OpenStreetMap slippy map on a canvas, with
// drag-to-pan, wheel/pinch zoom, click-to-choose and place-name search, and the
// Band of Totality shaded over it so a visitor can see which side of the edge
// they are choosing.
// All view math comes from map.js; tile loading, geocoding and the translator
// are injected, so this module owns nothing but the DOM.

import {
  OSM_TILE, makeView, resizeView, centerOn, panView, zoomView,
  visibleTiles, lonLatToViewPx, viewPxToLonLat, traceFieldOnView,
} from './map.js';
import { destinationPoint, metersPerPixel } from './geo.js';
import { totalityMargin } from './eclipse.js';

const DEFAULT_ZOOM = 13;
// Pointer travel below this still counts as a click rather than a pan.
const DRAG_SLOP_PX = 6;
// Length of the guide ray drawn toward the sun.
const SUN_RAY_M = 15000;
const MARKER_RADIUS_PX = 9;
const KEY_PAN_PX = 60;
// Pinch distance ratio that trips one zoom level.
const PINCH_STEP_RATIO = 1.5;
// How far up the tile pyramid to look for a stand-in while tiles load.
const FALLBACK_ANCESTOR_LEVELS = 5;
const SCALE_BAR_MAX_FRACTION = 0.28;
const SCALE_BAR_STEPS_M = [
  10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000,
];
// Nominatim asks for at most one request per second.
const SEARCH_MIN_INTERVAL_MS = 1100;
// Spacing of the samples the Band of Totality is traced from. In screen pixels,
// so the band is resolved to a few pixels at every zoom: coarse enough to be
// cheap when a whole continent is in view, fine enough that at street level the
// drawn edge cannot disagree with the verdict for the marker beside it.
const BAND_SAMPLE_PX = 16;
// How far beyond the viewport the samples reach, as a fraction of it. Panning
// within that margin reuses them, so a drag only costs a redraw.
const BAND_PAD_FRACTION = 0.3;
// The umbra is a shadow, so it reads as a dark wash — kept light enough that
// street names stay legible under it, with the edge picked out separately
// because the edge is the part anyone needs to see exactly.
const BAND_FILL = 'rgba(26, 22, 66, 0.24)';
const BAND_EDGE = '#cbb8ff';

// `t` is read on every use rather than snapshotted, so a language change takes
// effect here without rebuilding the picker.
export function createMapPicker({
  canvas, searchInput, searchButton, resultsList, statusEl,
  zoomInButton, zoomOutButton,
  tileSource, geocode, t, onPick,
}) {
  const ctx = canvas.getContext('2d');
  let view = makeView({ lat: 0, lon: 0, zoom: DEFAULT_ZOOM, widthPx: 1, heightPx: 1 });
  let marker = null;
  let sunAzimuthDeg = null;
  let drawQueued = false;
  let lastSearchMs = -Infinity;
  // The traced Band of Totality, held in the pixel frame it was sampled in.
  let band = null;

  // ---------- drawing ----------

  // False while the canvas has no box — it starts collapsed inside a <details>.
  // Everything downstream checks this, so a hidden picker draws nothing and, in
  // particular, requests no tiles until someone opens it.
  let visible = false;

  function layout() {
    const rect = canvas.getBoundingClientRect();
    visible = rect.width > 0 && rect.height > 0;
    if (!visible) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    // Draw in CSS pixels; the transform handles the device ratio.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    view = resizeView(view, rect.width, rect.height);
  }

  function scheduleDraw() {
    if (drawQueued || !visible) return;
    drawQueued = true;
    requestAnimationFrame(() => {
      drawQueued = false;
      draw();
    });
  }

  // Tiles are drawn from whatever the source already holds, and missing ones
  // trigger a redraw when they land. That keeps panning smooth instead of
  // blanking the map while requests are outstanding.
  function tileImage(t) {
    const img = tileSource.peek(t.z, t.x, t.y);
    if (img) return img;
    tileSource.load(t.z, t.x, t.y).then(loaded => {
      if (loaded) scheduleDraw();
    });
    return null;
  }

  function draw() {
    const { widthPx: W, heightPx: H } = view;
    ctx.fillStyle = '#0a0e16';
    ctx.fillRect(0, 0, W, H);

    for (const t of visibleTiles(view)) drawTile(t);

    drawTotalityBand();
    drawSunRay();
    drawMarker();
    drawScaleBar();
  }

  // ---------- the Band of Totality ----------

  // Within one zoom level a mercator pan is a plain pixel translation, so the
  // traced band is kept in the pixel frame it was sampled in and moved by a
  // single offset per frame. Re-tracing is only needed once the view has zoomed,
  // been resized, or slid past the sampled margin.
  function bandOffset() {
    const anchor = lonLatToViewPx(view, band.lat, band.lon);
    return { dx: anchor.x - band.widthPx / 2, dy: anchor.y - band.heightPx / 2 };
  }

  function bandStale() {
    if (!band) return true;
    if (band.zoom !== view.zoom) return true;
    if (band.widthPx !== view.widthPx || band.heightPx !== view.heightPx) return true;
    const { dx, dy } = bandOffset();
    return Math.abs(dx) > view.widthPx * BAND_PAD_FRACTION ||
      Math.abs(dy) > view.heightPx * BAND_PAD_FRACTION;
  }

  function traceBand() {
    const traced = traceFieldOnView(view, totalityMargin, BAND_SAMPLE_PX, BAND_PAD_FRACTION);
    band = {
      zoom: view.zoom, widthPx: view.widthPx, heightPx: view.heightPx,
      lat: view.lat, lon: view.lon, ...traced,
    };
  }

  function drawTotalityBand() {
    if (bandStale()) traceBand();
    if (!band.fills.length) return;
    const { dx, dy } = bandOffset();

    ctx.save();
    // Every cell goes into one path: shared borders cancel under the non-zero
    // fill rule, so the band comes out evenly shaded rather than showing the
    // sampling grid as seams.
    ctx.beginPath();
    for (const poly of band.fills) {
      ctx.moveTo(poly[0].x + dx, poly[0].y + dy);
      for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x + dx, poly[i].y + dy);
      ctx.closePath();
    }
    ctx.fillStyle = BAND_FILL;
    ctx.fill();

    ctx.beginPath();
    for (const [a, b] of band.edges) {
      ctx.moveTo(a.x + dx, a.y + dy);
      ctx.lineTo(b.x + dx, b.y + dy);
    }
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.stroke();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = BAND_EDGE;
    ctx.stroke();
    ctx.restore();

    drawBandLegend();
  }

  // Zoomed right in, the whole map can be inside the band with no edge in sight;
  // the wash alone would just look like a tinted basemap, so it gets a label.
  function drawBandLegend() {
    const x = 12;
    const y = 12;
    const label = t('map.bandLegend');
    ctx.save();
    ctx.fillStyle = BAND_FILL;
    ctx.fillRect(x, y, 13, 13);
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = BAND_EDGE;
    ctx.strokeRect(x + 0.5, y + 0.5, 12, 12);
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.strokeText(label, x + 19, y + 1);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, x + 19, y + 1);
    ctx.restore();
  }

  function drawTile(t) {
    const size = OSM_TILE.tileSizePx;
    const img = tileImage(t);
    // Round destinations so neighbouring tiles never leave a seam.
    if (img) {
      ctx.drawImage(img, Math.round(t.screenX), Math.round(t.screenY), size, size);
    } else if (!drawFromAncestor(t, size)) {
      drawFromChildren(t, size);
    }
  }

  // A zoom step changes every tile id at once, so without a stand-in the map
  // would flash empty on each step. Cover the gap with what is already cached:
  // an ancestor tile blown up (covers zooming in and panning), or the four
  // child tiles shrunk (covers zooming back out).
  function drawFromAncestor(t, size) {
    for (let up = 1; up <= FALLBACK_ANCESTOR_LEVELS && t.z - up >= 0; up++) {
      // peek, not load: a stand-in must never queue more requests.
      const img = tileSource.peek(t.z - up, t.x >> up, t.y >> up);
      if (!img) continue;
      const span = 2 ** up; // tiles per side of the ancestor
      const sub = size / span;
      ctx.drawImage(
        img, (t.x % span) * sub, (t.y % span) * sub, sub, sub,
        Math.round(t.screenX), Math.round(t.screenY), size, size,
      );
      return true;
    }
    return false;
  }

  function drawFromChildren(t, size) {
    const half = size / 2;
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const img = tileSource.peek(t.z + 1, t.x * 2 + dx, t.y * 2 + dy);
      if (img) {
        ctx.drawImage(
          img, Math.round(t.screenX + dx * half), Math.round(t.screenY + dy * half), half, half,
        );
      }
    }
  }

  // Where the sun will be, from the chosen spot: this is the direction that has
  // to be clear, so it belongs on the map you pick the spot with.
  function drawSunRay() {
    if (!marker || sunAzimuthDeg === null) return;
    const from = lonLatToViewPx(view, marker.lat, marker.lon);
    const end = destinationPoint(marker.lat, marker.lon, sunAzimuthDeg, SUN_RAY_M);
    const to = lonLatToViewPx(view, end.lat, end.lon);
    ctx.save();
    ctx.setLineDash([9, 7]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = '#f5b942';
    ctx.stroke();
    ctx.restore();
  }

  function drawMarker() {
    if (!marker) return;
    const { x, y } = lonLatToViewPx(view, marker.lat, marker.lon);
    ctx.save();
    // Dark halo first, so the marker reads over pale and dark map alike.
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.arc(x, y, MARKER_RADIUS_PX, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#f5b942';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - MARKER_RADIUS_PX - 5, y);
    ctx.lineTo(x + MARKER_RADIUS_PX + 5, y);
    ctx.moveTo(x, y - MARKER_RADIUS_PX - 5);
    ctx.lineTo(x, y + MARKER_RADIUS_PX + 5);
    ctx.stroke();
    ctx.fillStyle = '#f5b942';
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.restore();
  }

  function drawScaleBar() {
    const mPerPx = metersPerPixel(view.lat, view.zoom, OSM_TILE.tileSizePx);
    const maxPx = view.widthPx * SCALE_BAR_MAX_FRACTION;
    let meters = SCALE_BAR_STEPS_M[0];
    for (const step of SCALE_BAR_STEPS_M) {
      if (step / mPerPx <= maxPx) meters = step;
    }
    const lengthPx = meters / mPerPx;
    const x = 12;
    const y = view.heightPx - 16;
    const label = meters >= 1000 ? `${meters / 1000} km` : `${meters} m`;
    ctx.save();
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + lengthPx, y);
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x, y + 4);
    ctx.moveTo(x + lengthPx, y - 4);
    ctx.lineTo(x + lengthPx, y + 4);
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 3;
    ctx.strokeText(label, x, y - 7);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, x, y - 7);
    ctx.restore();
  }

  // ---------- pointer, wheel and keyboard ----------

  const localPoint = e => {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const pointers = new Map();
  let travelPx = 0;
  let pinchRef = null;

  // Midpoint and spread of the first two active pointers.
  const pinchState = () => {
    const [a, b] = [...pointers.values()];
    return {
      dist: Math.hypot(a.x - b.x, a.y - b.y),
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
  };

  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, localPoint(e));
    if (pointers.size === 1) travelPx = 0;
    if (pointers.size === 2) pinchRef = pinchState();
    canvas.style.cursor = 'grabbing';
  });

  canvas.addEventListener('pointermove', e => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const p = localPoint(e);
    pointers.set(e.pointerId, p);

    if (pointers.size >= 2 && pinchRef) {
      travelPx = Infinity; // a two-finger gesture is never a pick
      const { dist, mid } = pinchState();
      // The midpoint drags the map; the spread zooms it, one level per step, so
      // tiles stay at their native size.
      view = panView(view, mid.x - pinchRef.mid.x, mid.y - pinchRef.mid.y);
      const ratio = dist / pinchRef.dist;
      if (ratio > PINCH_STEP_RATIO || ratio < 1 / PINCH_STEP_RATIO) {
        view = zoomView(view, ratio > 1 ? 1 : -1, mid);
        pinchRef = { dist, mid };
      } else {
        pinchRef = { dist: pinchRef.dist, mid };
      }
      scheduleDraw();
      return;
    }

    const dx = p.x - prev.x;
    const dy = p.y - prev.y;
    travelPx += Math.hypot(dx, dy);
    view = panView(view, dx, dy);
    scheduleDraw();
  });

  function endPointer(e, { allowPick }) {
    const p = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchRef = null;
    if (pointers.size === 0) canvas.style.cursor = '';
    if (!p || !allowPick || travelPx > DRAG_SLOP_PX || pointers.size > 0) return;
    const { lat, lon } = viewPxToLonLat(view, p.x, p.y);
    onPick(lat, lon);
  }

  canvas.addEventListener('pointerup', e => endPointer(e, { allowPick: true }));
  canvas.addEventListener('pointercancel', e => endPointer(e, { allowPick: false }));

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    view = zoomView(view, e.deltaY < 0 ? 1 : -1, localPoint(e));
    scheduleDraw();
  }, { passive: false });

  canvas.addEventListener('dblclick', e => {
    e.preventDefault();
    view = zoomView(view, 1, localPoint(e));
    scheduleDraw();
  });

  // Keyboard equivalent: arrows pan, +/- zoom, Enter picks the center.
  canvas.addEventListener('keydown', e => {
    const pan = {
      ArrowLeft: [KEY_PAN_PX, 0], ArrowRight: [-KEY_PAN_PX, 0],
      ArrowUp: [0, KEY_PAN_PX], ArrowDown: [0, -KEY_PAN_PX],
    }[e.key];
    if (pan) {
      view = panView(view, pan[0], pan[1]);
    } else if (e.key === '+' || e.key === '=') {
      view = zoomView(view, 1);
    } else if (e.key === '-' || e.key === '_') {
      view = zoomView(view, -1);
    } else if (e.key === 'Enter') {
      onPick(view.lat, view.lon);
    } else {
      return;
    }
    e.preventDefault();
    scheduleDraw();
  });

  zoomInButton.addEventListener('click', () => {
    view = zoomView(view, 1);
    scheduleDraw();
  });
  zoomOutButton.addEventListener('click', () => {
    view = zoomView(view, -1);
    scheduleDraw();
  });

  // Covers every way the canvas can gain or change its box: being revealed out
  // of the collapsed <details>, a window resize, a device rotation. Setting
  // canvas.width/height cannot feed back into this, since the CSS box is fixed.
  new ResizeObserver(() => {
    layout();
    scheduleDraw();
  }).observe(canvas);

  // ---------- place-name search ----------

  function clearResults() {
    resultsList.innerHTML = '';
    resultsList.hidden = true;
  }

  function renderResults(results) {
    resultsList.innerHTML = '';
    for (const r of results) {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.innerHTML = `<strong></strong><span></span>`;
      button.querySelector('strong').textContent = r.name;
      // Drop the leading name so the two lines do not repeat each other.
      button.querySelector('span').textContent =
        r.label.startsWith(r.name) ? r.label.slice(r.name.length).replace(/^,\s*/, '') : r.label;
      button.addEventListener('click', () => {
        view = centerOn(view, r.lat, r.lon, Math.max(view.zoom, DEFAULT_ZOOM));
        clearResults();
        statusEl.textContent = '';
        onPick(r.lat, r.lon);
      });
      li.append(button);
      resultsList.append(li);
    }
    resultsList.hidden = results.length === 0;
  }

  async function runSearch() {
    const query = searchInput.value.trim();
    if (!query) return;
    const now = performance.now();
    if (now - lastSearchMs < SEARCH_MIN_INTERVAL_MS) return;
    lastSearchMs = now;

    clearResults();
    searchButton.disabled = true;
    statusEl.textContent = t('map.searching');
    let results = [];
    let failed = false;
    try {
      results = await geocode(query, view);
    } catch {
      failed = true;
    }
    searchButton.disabled = false;
    if (failed) {
      statusEl.textContent = t('map.searchFailed');
      return;
    }
    statusEl.textContent = results.length ? '' : t('map.searchNoResults', { query });
    renderResults(results);
  }

  searchButton.addEventListener('click', runSearch);
  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      runSearch();
    } else if (e.key === 'Escape') {
      clearResults();
    }
  });

  layout();

  return {
    // `recenter: false` keeps the map still when the pick came from the map
    // itself, so clicking near an edge does not yank the view.
    setMarker(latDeg, lonDeg, { recenter = true } = {}) {
      marker = { lat: latDeg, lon: lonDeg };
      if (recenter) view = centerOn(view, latDeg, lonDeg);
      scheduleDraw();
    },
    // Azimuth of the sun at the selected instant, or null when it is below the
    // horizon and the ray would mean nothing.
    setSunAzimuth(azimuthDeg) {
      if (azimuthDeg === sunAzimuthDeg) return;
      sunAzimuthDeg = azimuthDeg;
      scheduleDraw();
    },
    // Repaint with nothing else changed. Needed on a language change, because
    // the band legend is canvas text rather than DOM.
    refresh: scheduleDraw,
  };
}
