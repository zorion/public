import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sunPosition, refractionDeg } from '../src/solar.js';
import { destinationPoint, haversineDistance, lonLatToTile, apparentElevationDeg } from '../src/geo.js';

// Golden values from the USNO celestial navigation API (aa.usno.navy.mil),
// fetched 2026-07-19. dec/gha are geocentric; hc is geometric altitude for
// the assumed position; zn is azimuth from true north.
const USNO_GOLDENS = [
  {
    label: 'eclipse day 18:00 UT, Barcelona',
    msUTC: Date.UTC(2026, 7, 12, 18, 0, 0),
    lat: 41.39, lon: 2.17,
    dec: 14.798264, gha: 88.745738, alt: 9.04929, az: 281.793237,
  },
  {
    label: 'eclipse day 18:29 UT, Lleida (mid-totality zone)',
    msUTC: Date.UTC(2026, 7, 12, 18, 29, 0),
    lat: 41.62, lon: 0.62,
    dec: 14.79216, gha: 95.99661, alt: 4.95035, az: 285.41747,
  },
  {
    label: 'eclipse day 16:00 UT, Barcelona (high sun)',
    msUTC: Date.UTC(2026, 7, 12, 16, 0, 0),
    lat: 41.39, lon: 2.17,
    dec: 14.82349, gha: 58.74215, alt: 31.44918, az: 261.99547,
  },
  {
    label: 'equinox 12:00 UT, Girona',
    msUTC: Date.UTC(2026, 2, 20, 12, 0, 0),
    lat: 41.98, lon: 2.82,
    dec: -0.04544, gha: 358.14079, alt: 47.96561, az: 181.435,
  },
];

for (const g of USNO_GOLDENS) {
  test(`sunPosition matches USNO: ${g.label}`, () => {
    const p = sunPosition(g.msUTC, g.lat, g.lon);
    assert.ok(Math.abs(p.declinationDeg - g.dec) < 0.01, `dec ${p.declinationDeg} vs ${g.dec}`);
    assert.ok(Math.abs(p.ghaDeg - g.gha) < 0.02, `gha ${p.ghaDeg} vs ${g.gha}`);
    assert.ok(Math.abs(p.altitudeDeg - g.alt) < 0.02, `alt ${p.altitudeDeg} vs ${g.alt}`);
    assert.ok(Math.abs(p.azimuthDeg - g.az) < 0.05, `az ${p.azimuthDeg} vs ${g.az}`);
  });
}

test('sun semi-diameter on eclipse day matches NASA (15\'47.0" = 0.26306°)', () => {
  const p = sunPosition(Date.UTC(2026, 7, 12, 17, 46, 0), 41.39, 2.17);
  assert.ok(Math.abs(p.semiDiameterDeg - 0.26306) < 0.0005, String(p.semiDiameterDeg));
});

test('refraction is ~0.48° at the horizon and near zero high up', () => {
  assert.ok(Math.abs(refractionDeg(0) - 0.48) < 0.05);
  assert.ok(refractionDeg(60) < 0.02);
});

test('destinationPoint: 100 km due west from Barcelona', () => {
  const d = destinationPoint(41.39, 2.17, 270, 100000);
  assert.ok(Math.abs(d.lat - 41.39) < 0.02, String(d.lat)); // slight poleward drift only
  assert.ok(d.lon < 2.17 - 1.0 && d.lon > 2.17 - 1.4, String(d.lon));
  assert.ok(Math.abs(haversineDistance(41.39, 2.17, d.lat, d.lon) - 100000) < 50);
});

test('lonLatToTile matches known slippy-map values', () => {
  const t = lonLatToTile(0, 0, 1);
  assert.equal(Math.floor(t.x), 1);
  assert.equal(Math.floor(t.y), 1);
  // Barcelona at z13 sits in tile x≈4145, y≈3059
  const b = lonLatToTile(2.17, 41.39, 13);
  assert.equal(Math.floor(b.x), 4145);
  assert.equal(Math.floor(b.y), 3059);
});

test('apparentElevationDeg: curvature hides a distant equal-height target', () => {
  // Same height as the eye: nearby it reads ~0°, at 100 km it dips below -0.3°.
  assert.ok(Math.abs(apparentElevationDeg(1000, 100, 100)) < 0.01);
  assert.ok(apparentElevationDeg(100000, 100, 100) < -0.3);
});
