import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localCircumstances } from '../src/eclipse.js';

function utc(h, m, s) {
  return Date.UTC(2026, 7, 12, h, m, Math.floor(s), Math.round((s % 1) * 1000));
}

// NASA golden: instant of greatest eclipse (eclipse.gsfc.nasa.gov elements
// page): 17:45:53.8 UT at 65°13.5'N 25°13.7'W, sun alt 25.8°, az 248.4°,
// central duration 02m18.2s, eclipse magnitude 1.0386.
test('greatest-eclipse point matches NASA', () => {
  const lc = localCircumstances(65.225, -25.2283);
  assert.equal(lc.visible, true);
  assert.equal(lc.isTotal, true);
  assert.ok(Math.abs(lc.max.utcMs - utc(17, 45, 53.8)) < 5000, new Date(lc.max.utcMs).toISOString());
  assert.ok(Math.abs(lc.totalityDurationS - 138.2) < 2.5, String(lc.totalityDurationS));
  assert.ok(Math.abs(lc.max.altitudeDeg - 25.8) < 0.3, String(lc.max.altitudeDeg));
  assert.ok(Math.abs(lc.max.azimuthDeg - 248.4) < 0.5, String(lc.max.azimuthDeg));
  assert.ok(Math.abs(lc.magnitude - 1.0386) < 0.0015, String(lc.magnitude));
});

// NASA golden: central-line row of the umbral path table at 18:28 UT:
// 43°22.3'N 006°11.3'W, ratio 1.034, sun alt 10°, central duration 01m49.3s.
test('path central line at 18:28 UT matches NASA', () => {
  const lc = localCircumstances(43.3717, -6.1883);
  assert.equal(lc.isTotal, true);
  assert.ok(Math.abs(lc.max.utcMs - utc(18, 28, 0)) < 12000, new Date(lc.max.utcMs).toISOString());
  assert.ok(Math.abs(lc.totalityDurationS - 109.3) < 3, String(lc.totalityDurationS));
  assert.ok(Math.abs(lc.max.altitudeDeg - 10) < 0.5, String(lc.max.altitudeDeg));
  assert.ok(Math.abs(lc.magnitude - 1.034) < 0.0015, String(lc.magnitude));
});

// Contact ordering and basic invariants anywhere the eclipse is total.
test('contacts are ordered C1 < C2 < max < C3 < C4 on the central line', () => {
  const lc = localCircumstances(43.3717, -6.1883);
  assert.ok(lc.c1.utcMs < lc.c2.utcMs);
  assert.ok(lc.c2.utcMs < lc.max.utcMs);
  assert.ok(lc.max.utcMs < lc.c3.utcMs);
  assert.ok(lc.c3.utcMs < lc.c4.utcMs);
});

// Málaga is well south of the umbral band: deep partial, never total.
test('Málaga sees a partial eclipse only', () => {
  const lc = localCircumstances(36.72, -4.42);
  assert.equal(lc.visible, true);
  assert.equal(lc.isTotal, false);
  assert.equal(lc.c2, null);
  assert.equal(lc.totalityDurationS, 0);
  assert.ok(lc.magnitude > 0.8 && lc.magnitude < 1, String(lc.magnitude));
});

// The southern hemisphere sees nothing.
test('no eclipse in Cape Town', () => {
  const lc = localCircumstances(-33.92, 18.42);
  assert.equal(lc.visible, false);
});
