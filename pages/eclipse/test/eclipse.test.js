import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localCircumstances, totalityMargin } from '../src/eclipse.js';
import { destinationPoint, haversineDistance } from '../src/geo.js';

function utc(h, m, s) {
  return Date.UTC(2026, 7, 12, h, m, Math.floor(s), Math.round((s % 1) * 1000));
}

// The tolerances below are tight on purpose. μ, the Greenwich hour angle of the
// shadow axis, follows Earth's rotation and so belongs to UT, while the other
// elements are tabulated against TDT; reading μ at the TDT epoch instead shifts
// every location 0.298° of longitude — 24 km, the width of a third of the band —
// and these goldens are what notice.

// NASA golden: instant of greatest eclipse (eclipse.gsfc.nasa.gov elements
// page): 17:45:53.8 UT at 65°13.5'N 25°13.7'W, sun alt 25.8°, az 248.4°,
// central duration 02m18.2s, eclipse magnitude 1.0386.
test('greatest-eclipse point matches NASA', () => {
  const lc = localCircumstances(65.225, -25.2283);
  assert.equal(lc.visible, true);
  assert.equal(lc.isTotal, true);
  assert.ok(Math.abs(lc.max.utcMs - utc(17, 45, 53.8)) < 500, new Date(lc.max.utcMs).toISOString());
  assert.ok(Math.abs(lc.totalityDurationS - 138.2) < 0.25, String(lc.totalityDurationS));
  assert.ok(Math.abs(lc.max.altitudeDeg - 25.8) < 0.1, String(lc.max.altitudeDeg));
  assert.ok(Math.abs(lc.max.azimuthDeg - 248.4) < 0.2, String(lc.max.azimuthDeg));
  assert.ok(Math.abs(lc.magnitude - 1.0386) < 0.0003, String(lc.magnitude));
});

// NASA golden: central-line row of the umbral path table at 18:28 UT:
// 43°22.3'N 006°11.3'W, ratio 1.034, sun alt 10°, central duration 01m49.3s.
test('path central line at 18:28 UT matches NASA', () => {
  const lc = localCircumstances(43.3717, -6.1883);
  assert.equal(lc.isTotal, true);
  assert.ok(Math.abs(lc.max.utcMs - utc(18, 28, 0)) < 500, new Date(lc.max.utcMs).toISOString());
  assert.ok(Math.abs(lc.totalityDurationS - 109.3) < 0.25, String(lc.totalityDurationS));
  // The path table prints altitude to the whole degree, so this row can only
  // ever pin it that far.
  assert.ok(Math.abs(lc.max.altitudeDeg - 10) < 0.5, String(lc.max.altitudeDeg));
  assert.ok(Math.abs(lc.magnitude - 1.034) < 0.0005, String(lc.magnitude));
});

// Sharper than comparing coordinates: whatever NASA calls the central line has
// to be where totality lasts longest, so stepping off it either way must cost
// duration. A location error along the band would hide in the numbers above,
// but this notices it, because it is only symmetric at the true centre.
test('NASA central-line point is the local duration maximum across the band', () => {
  const centre = { lat: 43.3717, lon: -6.1883 };
  // The path runs about 127° there, so 37°/217° steps cross it squarely.
  const durationAt = km => {
    const p = destinationPoint(centre.lat, centre.lon, km > 0 ? 37 : 217, Math.abs(km) * 1000);
    return localCircumstances(p.lat, p.lon).totalityDurationS;
  };
  const here = localCircumstances(centre.lat, centre.lon).totalityDurationS;
  for (const km of [10, 20, 40]) {
    assert.ok(durationAt(km) < here, `+${km} km: ${durationAt(km)} >= ${here}`);
    assert.ok(durationAt(-km) < here, `-${km} km: ${durationAt(-km)} >= ${here}`);
  }
  // Symmetric to well under a kilometre. The table rounds to 0.1′ (~190 m) and
  // the 37° step is only approximately square to the path, so the bound has to
  // leave room for both; reading μ at the wrong epoch costs ~2 s here, far more.
  assert.ok(Math.abs(durationAt(10) - durationAt(-10)) < 0.15,
    `${durationAt(10)} vs ${durationAt(-10)}`);
});

// ---------- the Band of Totality as a field ----------

test('totalityMargin agrees in sign with isTotal, inside and outside', () => {
  // Inside: Tarragona and the Ebre delta. Outside: Barcelona and Girona, which
  // this eclipse misses by under 100 km — the reason the page exists.
  for (const [lat, lon] of [[41.1189, 1.2445], [40.71, 0.7], [39.57, 2.65]]) {
    assert.ok(totalityMargin(lat, lon) > 0, `${lat},${lon}`);
    assert.equal(localCircumstances(lat, lon).isTotal, true);
  }
  for (const [lat, lon] of [[41.3874, 2.1686], [41.9794, 2.8214], [36.72, -4.42]]) {
    assert.ok(totalityMargin(lat, lon) < 0, `${lat},${lon}`);
    assert.equal(localCircumstances(lat, lon).isTotal, false);
  }
});

// The map interpolates the band's edge from this field, so the zero it crosses
// has to be the same place where totality actually starts.
test('the zero of totalityMargin is where totality begins', () => {
  const lat = 41.5;
  let inside = 0.5, outside = 2.5; // longitudes either side of the edge
  for (let i = 0; i < 40; i++) {
    const mid = (inside + outside) / 2;
    if (totalityMargin(lat, mid) > 0) inside = mid; else outside = mid;
  }
  const edgeLon = (inside + outside) / 2;
  assert.equal(localCircumstances(lat, edgeLon - 0.01).isTotal, true);
  assert.equal(localCircumstances(lat, edgeLon + 0.01).isTotal, false);
  // Totality has to be vanishing there, not merely present.
  assert.ok(localCircumstances(lat, edgeLon - 0.01).totalityDurationS < 12,
    String(localCircumstances(lat, edgeLon - 0.01).totalityDurationS));
  // The edge crosses between Lleida (inside) and Barcelona (outside).
  assert.ok(haversineDistance(lat, edgeLon, lat, 2.1686) > 50000);
});

test('the field is negative where the elements say nothing', () => {
  // Antipodal, night side, and the far hemisphere: no shadow, no extrapolation.
  for (const [lat, lon] of [[-33.92, 18.42], [-65, 155], [0, 180], [-20, -60]]) {
    assert.ok(totalityMargin(lat, lon) < 0, `${lat},${lon}`);
  }
});

// Places whose sun has already set are outside the band even where the umbra
// still touches the globe: the eastern end is closed by the sunset limit.
test('the band stops at the sunset limit', () => {
  const lc = localCircumstances(36.5, 12.5);
  if (lc.visible && lc.isTotal) {
    assert.ok(lc.max.altitudeDeg > 0 || totalityMargin(36.5, 12.5) < 0);
  }
  // Walk east along a latitude the band reaches at sunset: once the field turns
  // negative it must stay negative, so the map draws one closed band.
  let sawNegative = false;
  for (let lon = 4; lon <= 30; lon += 0.25) {
    const m = totalityMargin(37, lon);
    if (m < 0) sawNegative = true;
    else assert.ok(!sawNegative, `band reopens at lon ${lon}`);
  }
  assert.ok(sawNegative);
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
