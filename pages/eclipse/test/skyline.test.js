import { test } from 'node:test';
import assert from 'node:assert/strict';
import { haversineDistance } from '../src/geo.js';
import {
  computeSkyline, computeNearField, skylineAt, obstructionAt, sunVisible,
} from '../src/skyline.js';

const ORIGIN = { lat: 41.5, lon: 1.0 };

// Terrain defined by distance from the origin, so tests control geometry.
function terrainByDistance(fn) {
  return async (lat, lon) => fn(haversineDistance(ORIGIN.lat, ORIGIN.lon, lat, lon));
}

test('flat sea: skyline is the horizon dip (~ -0.04° for 2 m eye)', async () => {
  const sky = await computeSkyline({
    latDeg: ORIGIN.lat, lonDeg: ORIGIN.lon, eyeElevM: 2,
    azFromDeg: 270, azToDeg: 270,
    sampleTerrain: terrainByDistance(() => 0),
  });
  const e = sky.azimuths[0].elevationDeg;
  assert.ok(e < 0 && e > -0.1, String(e));
  assert.ok(Math.abs(e - -0.042) < 0.015, String(e));
});

test('100 m wall at ~950 m subtends ~5.8°', async () => {
  const sky = await computeSkyline({
    latDeg: ORIGIN.lat, lonDeg: ORIGIN.lon, eyeElevM: 2,
    azFromDeg: 285, azToDeg: 285,
    sampleTerrain: terrainByDistance(d => (d > 950 ? 100 : 0)),
  });
  const a = sky.azimuths[0];
  assert.ok(a.elevationDeg > 5.5 && a.elevationDeg < 6.1, String(a.elevationDeg));
  assert.ok(a.ridgeDistanceM > 940 && a.ridgeDistanceM < 1000, String(a.ridgeDistanceM));
});

test('curvature hides a 500 m ridge at 100 km but not a 1500 m one', async () => {
  const low = await computeSkyline({
    latDeg: ORIGIN.lat, lonDeg: ORIGIN.lon, eyeElevM: 2,
    azFromDeg: 280, azToDeg: 280,
    sampleTerrain: terrainByDistance(d => (d > 100000 ? 500 : 0)),
  });
  assert.ok(low.azimuths[0].elevationDeg < 0, String(low.azimuths[0].elevationDeg));

  const high = await computeSkyline({
    latDeg: ORIGIN.lat, lonDeg: ORIGIN.lon, eyeElevM: 2,
    azFromDeg: 280, azToDeg: 280,
    sampleTerrain: terrainByDistance(d => (d > 100000 ? 1500 : 0)),
  });
  assert.ok(high.azimuths[0].elevationDeg > 0.3, String(high.azimuths[0].elevationDeg));
});

test('near field: a 20 m surface reads ~24° at the 40 m sample', async () => {
  const nf = await computeNearField({
    latDeg: ORIGIN.lat, lonDeg: ORIGIN.lon, eyeElevM: 2,
    azFromDeg: 284, azToDeg: 288, azStepDeg: 2,
    sampleSurface: async () => 20,
  });
  assert.equal(nf.azimuths.length, 3);
  const a = nf.azimuths[0];
  assert.ok(Math.abs(a.elevationDeg - 24.2) < 0.5, String(a.elevationDeg));
  assert.equal(a.ridgeDistanceM, 40);
});

test('skylineAt interpolates and bounds', () => {
  const sky = { azimuths: [
    { azimuthDeg: 270, elevationDeg: 1 },
    { azimuthDeg: 271, elevationDeg: 3 },
  ] };
  assert.equal(skylineAt(sky, 270.5), 2);
  assert.equal(skylineAt(sky, 269), null);
});

test('obstruction is the max of terrain and near field; verdict follows', () => {
  const terrain = { azimuths: [{ azimuthDeg: 285, elevationDeg: 2 }, { azimuthDeg: 287, elevationDeg: 2 }] };
  const near = { azimuths: [{ azimuthDeg: 285, elevationDeg: 5 }, { azimuthDeg: 287, elevationDeg: 5 }] };
  assert.equal(obstructionAt(terrain, near, 286), 5);
  assert.equal(obstructionAt(terrain, null, 286), 2);
  assert.equal(sunVisible(terrain, near, 286, 6), true);
  assert.equal(sunVisible(terrain, near, 286, 4), false);
  assert.equal(sunVisible(terrain, near, 260, 10), null);
});
