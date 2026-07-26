import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lonLatToTile, tileToLonLat } from '../src/geo.js';
import {
  OSM_TILE, makeView, resizeView, centerOn, panView, zoomView,
  visibleTiles, lonLatToViewPx, viewPxToLonLat, viewBounds,
  geocodeUrl, parseGeocode,
} from '../src/map.js';

const BCN = { lat: 41.3874, lon: 2.1686 };
const view = (over = {}) =>
  makeView({ ...BCN, zoom: 13, widthPx: 800, heightPx: 352, ...over });

test('tileToLonLat inverts lonLatToTile', () => {
  for (const z of [0, 5, 13, 19]) {
    const t = lonLatToTile(BCN.lon, BCN.lat, z);
    const back = tileToLonLat(t.x, t.y, z);
    assert.ok(Math.abs(back.lat - BCN.lat) < 1e-9, `lat at z=${z}`);
    assert.ok(Math.abs(back.lon - BCN.lon) < 1e-9, `lon at z=${z}`);
  }
});

test('the view center lands on the viewport center', () => {
  const v = view();
  const p = lonLatToViewPx(v, v.lat, v.lon);
  assert.ok(Math.abs(p.x - v.widthPx / 2) < 1e-6);
  assert.ok(Math.abs(p.y - v.heightPx / 2) < 1e-6);
});

test('pixel and coordinate conversions round-trip', () => {
  const v = view();
  for (const [x, y] of [[0, 0], [17, 291], [400, 176], [800, 352]]) {
    const geo = viewPxToLonLat(v, x, y);
    const back = lonLatToViewPx(v, geo.lat, geo.lon);
    assert.ok(Math.abs(back.x - x) < 1e-6, `x at ${x},${y}`);
    assert.ok(Math.abs(back.y - y) < 1e-6, `y at ${x},${y}`);
  }
});

test('north and east are up and right', () => {
  const v = view();
  const north = lonLatToViewPx(v, v.lat + 0.01, v.lon);
  const east = lonLatToViewPx(v, v.lat, v.lon + 0.01);
  assert.ok(north.y < v.heightPx / 2);
  assert.ok(east.x > v.widthPx / 2);
});

test('makeView clamps zoom to the source range and wraps longitude', () => {
  assert.equal(view({ zoom: 99 }).zoom, OSM_TILE.maxZoom);
  assert.equal(view({ zoom: -3 }).zoom, OSM_TILE.minZoom);
  assert.ok(Math.abs(view({ lon: 200 }).lon - -160) < 1e-9);
  assert.ok(view({ lat: 89 }).lat < 86);
});

test('dragging the content right moves the center west', () => {
  const v = view();
  const panned = panView(v, 120, 0);
  assert.ok(panned.lon < v.lon);
  assert.equal(panned.zoom, v.zoom);
  // The point that was under the pointer is now 120 px further right.
  const p = lonLatToViewPx(panned, v.lat, v.lon);
  assert.ok(Math.abs(p.x - (v.widthPx / 2 + 120)) < 1e-6);
});

test('dragging up moves the center north', () => {
  const v = view();
  assert.ok(panView(v, 0, 100).lat > v.lat);
});

test('panning by zero is a no-op', () => {
  const v = view();
  const same = panView(v, 0, 0);
  assert.ok(Math.abs(same.lat - v.lat) < 1e-9);
  assert.ok(Math.abs(same.lon - v.lon) < 1e-9);
});

test('zoomView holds the anchor pixel fixed', () => {
  const v = view();
  const anchor = { x: 90, y: 300 };
  const held = viewPxToLonLat(v, anchor.x, anchor.y);
  for (const dz of [1, -1, 3]) {
    const zoomed = zoomView(v, dz, anchor);
    assert.equal(zoomed.zoom, v.zoom + dz);
    const p = lonLatToViewPx(zoomed, held.lat, held.lon);
    assert.ok(Math.abs(p.x - anchor.x) < 0.5, `x for dz=${dz}: ${p.x}`);
    assert.ok(Math.abs(p.y - anchor.y) < 0.5, `y for dz=${dz}: ${p.y}`);
  }
});

test('zoomView without an anchor keeps the center, and stops at the limits', () => {
  const v = view();
  const zoomed = zoomView(v, 2);
  assert.ok(Math.abs(zoomed.lat - v.lat) < 1e-9);
  assert.ok(Math.abs(zoomed.lon - v.lon) < 1e-9);
  assert.equal(zoomView(view({ zoom: OSM_TILE.maxZoom }), 1).zoom, OSM_TILE.maxZoom);
  assert.equal(zoomView(view({ zoom: OSM_TILE.minZoom }), -1).zoom, OSM_TILE.minZoom);
});

test('visibleTiles covers the viewport with correctly placed tiles', () => {
  const v = view();
  const tiles = visibleTiles(v);
  const size = OSM_TILE.tileSizePx;
  assert.ok(tiles.length >= Math.ceil(v.widthPx / size) * Math.ceil(v.heightPx / size));
  assert.ok(tiles.every(t => t.z === v.zoom));

  // Every viewport pixel falls inside some tile's drawn square.
  for (const [x, y] of [[0, 0], [v.widthPx - 1, v.heightPx - 1], [400, 176]]) {
    assert.ok(
      tiles.some(t => x >= t.screenX && x < t.screenX + size &&
        y >= t.screenY && y < t.screenY + size),
      `pixel ${x},${y} uncovered`,
    );
  }

  // A tile's own top-left corner maps back to its tile coordinates.
  const t0 = tiles[0];
  const corner = viewPxToLonLat(v, t0.screenX, t0.screenY);
  const back = lonLatToTile(corner.lon, corner.lat, v.zoom);
  assert.ok(Math.abs(back.x - t0.x) < 1e-6);
  assert.ok(Math.abs(back.y - t0.y) < 1e-6);
});

test('visibleTiles wraps x across the antimeridian and clamps y at the poles', () => {
  const wrapped = visibleTiles(makeView({
    lat: 0, lon: 179.99, zoom: 3, widthPx: 800, heightPx: 352,
  }));
  const n = 2 ** 3;
  assert.ok(wrapped.every(t => t.x >= 0 && t.x < n && t.y >= 0 && t.y < n));
  assert.ok(wrapped.some(t => t.x === 0), 'expected a tile from the far side');

  const polar = visibleTiles(makeView({
    lat: 85, lon: 0, zoom: 3, widthPx: 800, heightPx: 700,
  }));
  assert.ok(polar.every(t => t.y >= 0 && t.y < n));
});

test('viewBounds brackets the center and opens up when the world fits', () => {
  const b = viewBounds(view());
  assert.ok(b.west < BCN.lon && BCN.lon < b.east);
  assert.ok(b.south < BCN.lat && BCN.lat < b.north);

  // At the minimum zoom the world is 2048 px wide, so a wider viewport shows
  // all of it and the bounds must not wrap back on themselves.
  const worldPx = OSM_TILE.tileSizePx * 2 ** OSM_TILE.minZoom;
  const whole = viewBounds(resizeView(
    makeView({ lat: 0, lon: 0, zoom: OSM_TILE.minZoom, widthPx: 100, heightPx: 400 }),
    worldPx + 400, 400,
  ));
  assert.equal(whole.west, -180);
  assert.equal(whole.east, 180);
});

test('geocodeUrl biases by the viewport in lon,lat,lon,lat order', () => {
  const url = new URL(geocodeUrl('Àger', view()));
  assert.equal(url.origin + url.pathname, 'https://nominatim.openstreetmap.org/search');
  assert.equal(url.searchParams.get('q'), 'Àger');
  assert.equal(url.searchParams.get('format'), 'jsonv2');

  const [west, south, east, north] = url.searchParams.get('viewbox').split(',').map(Number);
  assert.ok(west < BCN.lon && BCN.lon < east, 'longitudes first and third');
  assert.ok(south < BCN.lat && BCN.lat < north, 'latitudes second and fourth');
});

test('geocodeUrl escapes the query and omits viewbox without a view', () => {
  assert.ok(geocodeUrl('Sant Jeroni & co').includes('Sant+Jeroni+%26+co'));
  assert.ok(!geocodeUrl('Girona').includes('viewbox'));
});

test('parseGeocode keeps usable hits and drops the rest', () => {
  const results = parseGeocode([
    { lat: '42.0000405', lon: '0.7632134', name: 'Àger', display_name: 'Àger, Noguera, Lérida' },
    { lat: 'nope', lon: '1.0', display_name: 'broken' },
    { lat: '95', lon: '1.0', display_name: 'off the planet' },
    { lat: '41.6', lon: '1.81', display_name: 'Sant Jeroni, Montserrat' },
  ]);
  assert.equal(results.length, 2);
  assert.deepEqual(results[0], {
    lat: 42.0000405, lon: 0.7632134, name: 'Àger', label: 'Àger, Noguera, Lérida',
  });
  // Falls back to the first part of display_name when `name` is missing.
  assert.equal(results[1].name, 'Sant Jeroni');
});

test('parseGeocode tolerates junk payloads', () => {
  assert.deepEqual(parseGeocode(null), []);
  assert.deepEqual(parseGeocode({ error: 'nope' }), []);
  assert.deepEqual(parseGeocode([null]), []);
});

test('centerOn moves the view without resizing it', () => {
  const v = view();
  const moved = centerOn(v, 42.005, 0.913);
  assert.ok(Math.abs(moved.lat - 42.005) < 1e-9);
  assert.ok(Math.abs(moved.lon - 0.913) < 1e-9);
  assert.equal(moved.widthPx, v.widthPx);
  assert.equal(moved.zoom, v.zoom);
  assert.equal(centerOn(v, 42.005, 0.913, 16).zoom, 16);
});
