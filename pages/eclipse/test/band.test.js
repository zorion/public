// The Band of Totality as the picker actually draws it: the eclipse field traced
// through the real view math, so a sign or indexing slip anywhere along the way
// shows up as the shading disagreeing with the verdict.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeView, lonLatToViewPx, viewPxToLonLat, traceFieldOnView } from '../src/map.js';
import { totalityMargin } from '../src/eclipse.js';

// The same numbers mapview.js draws with.
const STEP_PX = 16;
const PAD = 0.3;

const PLACES = {
  Barcelona: [41.3874, 2.1686],
  Girona: [41.9794, 2.8214],
  Lleida: [41.6176, 0.62],
  Tarragona: [41.1189, 1.2445],
};

const viewOver = (lat, lon, zoom) => makeView({ lat, lon, zoom, widthPx: 880, heightPx: 352 });
const trace = view => traceFieldOnView(view, totalityMargin, STEP_PX, PAD);

const fieldAtPx = (view, x, y) => {
  const c = viewPxToLonLat(view, x, y);
  return totalityMargin(c.lat, c.lon);
};

// Even-odd crossing test, which is what a canvas fill comes to for one polygon.
function inPolygon(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if ((a.y > y) !== (b.y > y) && x < a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x)) {
      inside = !inside;
    }
  }
  return inside;
}
const shaded = (traced, x, y) => traced.fills.some(poly => inPolygon(poly, x, y));

test('the shading puts each place on the same side as its verdict', () => {
  let checked = 0;
  for (const zoom of [5, 7, 9, 11]) {
    const view = viewOver(41.5, 1.4, zoom);
    const traced = trace(view);
    for (const [name, [lat, lon]] of Object.entries(PLACES)) {
      const p = lonLatToViewPx(view, lat, lon);
      // Only the viewport is traced, so only places in it have an answer; a
      // zoomed-in view legitimately says nothing about somewhere off-screen.
      if (p.x < 0 || p.x > view.widthPx || p.y < 0 || p.y > view.heightPx) continue;
      checked++;
      assert.equal(shaded(traced, p.x, p.y), totalityMargin(lat, lon) > 0,
        `${name} at zoom ${zoom}`);
    }
  }
  assert.ok(checked >= 10, `only ${checked} place-and-zoom combinations were in view`);
});

test('Lleida is shaded and Barcelona is not, at a zoom that shows both', () => {
  const view = viewOver(41.5, 1.4, 8);
  const traced = trace(view);
  const at = name => {
    const p = lonLatToViewPx(view, ...PLACES[name]);
    return shaded(traced, p.x, p.y);
  };
  assert.equal(at('Lleida'), true);
  assert.equal(at('Tarragona'), true);
  assert.equal(at('Barcelona'), false);
  assert.equal(at('Girona'), false);
});

test('the drawn edge lands within one sample of where the field turns', () => {
  // Walk a scanline across the band: where the shading stops has to be where the
  // field changes sign, or the picker would contradict itself beside the marker.
  const view = viewOver(41.5, 1.4, 8);
  const traced = trace(view);
  const y = Math.round(view.heightPx / 2);
  let crossings = 0;
  for (let x = 1; x < view.widthPx; x++) {
    if (shaded(traced, x, y) === shaded(traced, x - 1, y)) continue;
    crossings++;
    assert.ok(fieldAtPx(view, x - STEP_PX, y) > 0 !== fieldAtPx(view, x + STEP_PX, y) > 0,
      `the shading ends at x=${x} but the field does not turn there`);
  }
  assert.equal(crossings, 1, `expected one band edge across this view, got ${crossings}`);
});

test('a view deep inside the band is shaded solid, with no edge to draw', () => {
  // The Ebre delta at street level: every sample is inside, so the region is
  // whole cells and there is no outline anywhere in view.
  const view = viewOver(40.71, 0.7, 13);
  const traced = trace(view);
  assert.deepEqual(traced.edges, []);
  assert.ok(traced.fills.length > 0);
  for (const poly of traced.fills) assert.equal(poly.length, 4);
  assert.equal(shaded(traced, view.widthPx / 2, view.heightPx / 2), true);
});

test('a view far outside the band has nothing to draw', () => {
  const traced = trace(viewOver(36.72, -4.42, 11)); // Málaga: deep partial only
  assert.deepEqual(traced.fills, []);
  assert.deepEqual(traced.edges, []);
});

test('tracing is cheap enough to sit in a redraw', () => {
  const view = viewOver(41.5, 1.4, 8);
  trace(view); // warm up
  const t0 = performance.now();
  trace(view);
  assert.ok(performance.now() - t0 < 60, `${(performance.now() - t0).toFixed(1)} ms to trace`);
});
