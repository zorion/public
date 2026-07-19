import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeMapboxRGB, decodeTerrarium, bilinear, zoomForDistance, inCatalonia,
  sampleHeight, gfiUrl, parseGfi, tileUrl, ICGC_TILE, TERRARIUM_TILE,
} from '../src/heights.js';

test('mapbox terrain-rgb decoding', () => {
  assert.equal(decodeMapboxRGB(1, 134, 160), 0); // 100000 * 0.1 - 10000
  assert.ok(Math.abs(decodeMapboxRGB(1, 202, 72) - 1732.0) < 0.01);
});

test('terrarium decoding', () => {
  assert.equal(decodeTerrarium(128, 7, 0), 7);
  assert.equal(decodeTerrarium(127, 255, 0), -1);
});

test('bilinear interpolation at grid center', () => {
  const grid = { sizePx: 2, data: Float32Array.from([0, 10, 20, 30]) };
  assert.equal(bilinear(grid, 0.5, 0.5), 15);
  assert.equal(bilinear(grid, 0, 0), 0);
});

test('bilinear returns null on nodata', () => {
  const grid = { sizePx: 2, data: Float32Array.from([NaN, 10, 20, 30]) };
  assert.equal(bilinear(grid, 0.2, 0.2), null);
});

test('zoom policy: fine near, coarse far', () => {
  assert.equal(zoomForDistance(1000), 13);
  assert.equal(zoomForDistance(20000), 11);
  assert.equal(zoomForDistance(150000), 9);
});

test('Catalonia bounding box', () => {
  assert.equal(inCatalonia(41.39, 2.17), true);   // Barcelona
  assert.equal(inCatalonia(41.65, -0.88), false); // Zaragoza
});

test('tile URL templates', () => {
  assert.equal(
    tileUrl(ICGC_TILE, 13, 4145, 3059),
    'https://geoserveis.icgc.cat/servei/catalunya/contextmaps-terreny-5m-rgb/wmts/13/4145/3059.png',
  );
  assert.ok(tileUrl(TERRARIUM_TILE, 9, 259, 191).includes('elevation-tiles-prod/terrarium/9/259/191.png'));
});

test('sampleHeight falls back from ICGC to terrarium inside Catalonia', async () => {
  const flat100 = { sizePx: 2, data: Float32Array.from([100, 100, 100, 100]) };
  const calls = [];
  const loadGrid = async (source, z, x, y) => {
    calls.push(source);
    return source === ICGC_TILE ? null : flat100;
  };
  const h = await sampleHeight(loadGrid, 41.5, 1.5, 5000);
  assert.equal(h, 100);
  assert.equal(calls[0], ICGC_TILE);
  assert.equal(calls[1], TERRARIUM_TILE);
});

test('sampleHeight skips ICGC outside Catalonia', async () => {
  const flat100 = { sizePx: 2, data: Float32Array.from([100, 100, 100, 100]) };
  const calls = [];
  const loadGrid = async (source) => {
    calls.push(source);
    return flat100;
  };
  await sampleHeight(loadGrid, 48.85, 2.35, 5000); // Paris
  assert.deepEqual(calls, [TERRARIUM_TILE]);
});

test('GetFeatureInfo URL uses WMS 1.3.0 lat,lon axis order', () => {
  const url = gfiUrl(41.387, 2.167);
  assert.ok(url.includes('BBOX=41.386%2C2.166%2C41.388%2C2.168'), url);
  assert.ok(url.includes('model-superficies-catalunya-correlacio-1m-2024'));
  assert.ok(url.includes('INFO_FORMAT=application%2Fjson'));
});

test('parseGfi reads live-format response', () => {
  // Canned from a real query near Plaça de Catalunya, 2026-07-19.
  const live = {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: { x: '2.1669942', y: '41.387001', 'Elevació': '43.271999' },
    }],
  };
  assert.ok(Math.abs(parseGfi(live) - 43.272) < 0.001);
  assert.equal(parseGfi({ type: 'FeatureCollection', features: [] }), null);
});
