import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moonDisk, localCircumstances, ECLIPSE_2026_08_12 } from '../src/eclipse.js';
import { sunPosition, refractionDeg } from '../src/solar.js';
import { toRad, toDeg } from '../src/geo.js';

const BARCELONA = [41.3874, 2.1686]; // north of the band: deep partial
const MALAGA = [36.72, -4.42]; // south of the band: deep partial
const CENTRAL_LINE = [43.3717, -6.1883]; // NASA's 18:28 UT central-line row

// Angle between two (azimuth, geometric elevation) directions.
function skySeparationDeg(a, b) {
  const [h1, h2] = [toRad(a.altitudeDeg), toRad(b.altitudeDeg)];
  const dAz = toRad(a.azimuthDeg - b.azimuthDeg);
  return toDeg(Math.acos(
    Math.sin(h1) * Math.sin(h2) + Math.cos(h1) * Math.cos(h2) * Math.cos(dAz),
  ));
}

// Back out declination and hour angle from a drawn sky position. The panorama
// only ever sees azimuth and elevation, so this is how a test can ask which way
// round the disks actually are.
function equatorialOf({ azimuthDeg, altitudeDeg }, latDeg) {
  const [A, h, phi] = [toRad(azimuthDeg), toRad(altitudeDeg), toRad(latDeg)];
  const decDeg = toDeg(Math.asin(
    Math.sin(h) * Math.sin(phi) + Math.cos(h) * Math.cos(phi) * Math.cos(A),
  ));
  const hourAngleDeg = toDeg(Math.atan2(
    -Math.cos(h) * Math.sin(A),
    Math.cos(phi) * Math.sin(h) - Math.sin(phi) * Math.cos(h) * Math.cos(A),
  ));
  return { decDeg, hourAngleDeg };
}

// The whole point of deriving the disk from the Besselian elements rather than
// from a lunar ephemeris: the limbs touch at exactly the contacts the verdict
// prints, so the drawing can never disagree with the table above it.
test('the limbs are externally tangent at C1 and C4', () => {
  for (const place of [BARCELONA, CENTRAL_LINE]) {
    const lc = localCircumstances(...place);
    for (const contact of [lc.c1, lc.c4]) {
      const moon = moonDisk(contact.utcMs, ...place);
      const sun = sunPosition(contact.utcMs, ...place);
      const tangent = sun.semiDiameterDeg + moon.semiDiameterDeg;
      assert.ok(Math.abs(moon.separationDeg - tangent) < 1e-6,
        `${place}: ${moon.separationDeg} vs ${tangent}`);
      assert.ok(moon.obscuration < 1e-9, String(moon.obscuration));
    }
  }
});

test('the limbs are internally tangent at C2 and C3, and totality is complete between', () => {
  const lc = localCircumstances(...CENTRAL_LINE);
  for (const contact of [lc.c2, lc.c3]) {
    const moon = moonDisk(contact.utcMs, ...CENTRAL_LINE);
    const sun = sunPosition(contact.utcMs, ...CENTRAL_LINE);
    const tangent = moon.semiDiameterDeg - sun.semiDiameterDeg;
    assert.ok(Math.abs(moon.separationDeg - tangent) < 1e-6,
      `${moon.separationDeg} vs ${tangent}`);
    // Exactly at internal tangency the sun is covered but the lens formula sits
    // on its own branch boundary, so this asks for total, not for the literal 1.
    assert.ok(moon.obscuration > 1 - 1e-6, String(moon.obscuration));
  }
  const mid = (lc.c2.utcMs + lc.c3.utcMs) / 2;
  assert.equal(moonDisk(mid, ...CENTRAL_LINE).obscuration, 1);
  // And not a moment longer than the table says.
  assert.ok(moonDisk(lc.c1.utcMs + (lc.c2.utcMs - lc.c1.utcMs) * 0.999, ...CENTRAL_LINE)
    .obscuration < 1);
});

// Two independent readings of the same geometry: eclipse magnitude is the
// covered fraction of the sun's *diameter*, which the drawn disks must
// reproduce from their own separation and radii.
test('the drawn disks reproduce the tabulated magnitude', () => {
  for (const place of [BARCELONA, [36.72, -4.42], [48.85, 2.35]]) {
    const lc = localCircumstances(...place);
    const moon = moonDisk(lc.max.utcMs, ...place);
    const sun = sunPosition(lc.max.utcMs, ...place);
    const fromDisks = (sun.semiDiameterDeg + moon.semiDiameterDeg - moon.separationDeg) /
      (2 * sun.semiDiameterDeg);
    assert.ok(Math.abs(fromDisks - lc.magnitude) < 1e-9,
      `${place}: ${fromDisks} vs ${lc.magnitude}`);
  }
});

// NASA prints the moon/sun diameter ratio on the central-line row as 1.034.
test('the moon is the larger disk, by the ratio NASA prints', () => {
  const lc = localCircumstances(...CENTRAL_LINE);
  const moon = moonDisk(lc.max.utcMs, ...CENTRAL_LINE);
  const sun = sunPosition(lc.max.utcMs, ...CENTRAL_LINE);
  assert.ok(Math.abs(moon.semiDiameterDeg / sun.semiDiameterDeg - 1.034) < 0.0005,
    String(moon.semiDiameterDeg / sun.semiDiameterDeg));
});

// The disk is drawn in the panorama's own frame — azimuth and elevation — so
// the separation has to survive the trip out of equatorial coordinates.
test('separation in the sky matches the separation of the disks', () => {
  const lc = localCircumstances(...BARCELONA);
  for (const t of [lc.c1.utcMs, lc.max.utcMs, lc.c4.utcMs]) {
    const moon = moonDisk(t, ...BARCELONA);
    const sky = skySeparationDeg(moon, sunPosition(t, ...BARCELONA));
    assert.ok(Math.abs(sky - moon.separationDeg) < 1e-9, `${sky} vs ${moon.separationDeg}`);
  }
});

// The panorama plots apparent elevation and draws undistorted disks. Letting the
// moon take its own refraction would squeeze the pair together — by up to 8% of
// the sun's radius down at the horizon — while the disks kept their size, so the
// drawn limbs would overlap before the C1 printed beside them.
test('the pair rides on the sun’s refraction, so the drawn gap is the airless one', () => {
  const lc = localCircumstances(...BARCELONA);
  for (const t of [lc.c1.utcMs, lc.max.utcMs, lc.c4.utcMs]) {
    const moon = moonDisk(t, ...BARCELONA);
    const sun = sunPosition(t, ...BARCELONA);
    const drawn = moon.apparentAltitudeDeg - sun.apparentAltitudeDeg;
    const airless = moon.altitudeDeg - sun.altitudeDeg;
    assert.ok(Math.abs(drawn - airless) < 1e-12, `${drawn} vs ${airless}`);
    // Refraction is being applied, so the whole pair does sit above where the
    // airless geometry puts it.
    assert.ok(sun.apparentAltitudeDeg - sun.altitudeDeg > 0.05);
  }
});

// …and the choice is observable, not academic: the two bodies' own lifts differ
// while the sun still stands clear of the horizon.
test('the moon’s own refraction would have moved it off the sun', () => {
  const lc = localCircumstances(...BARCELONA);
  const moon = moonDisk(lc.c1.utcMs, ...BARCELONA);
  const sun = sunPosition(lc.c1.utcMs, ...BARCELONA);
  const ownLift = refractionDeg(moon.altitudeDeg);
  const shared = sun.apparentAltitudeDeg - sun.altitudeDeg;
  assert.ok(Math.abs(ownLift - shared) > 1e-4, `${ownLift} vs ${shared}`);
});

// Which way round the disks sit is the whole difference between a bite out of
// the top of the sun and a bite out of the bottom, and the panorama draws the
// sun a few degrees above a ridge — so the orientation has to come through the
// horizontal conversion intact, not just the separation.
test('the bite lands on the side the geometry puts it', () => {
  for (const [place, sign, where] of [[BARCELONA, -1, 'south'], [MALAGA, +1, 'north']]) {
    const lc = localCircumstances(...place);
    const t = lc.max.utcMs;
    const dDec = equatorialOf(moonDisk(t, ...place), place[0]).decDeg -
      equatorialOf(sunPosition(t, ...place), place[0]).decDeg;
    // Observers north of the band see the moon pass south of the sun's centre,
    // and the other way round south of it. At its own maximum an observer's
    // offset from the axis is square to the shadow's motion, which at this
    // eclipse's geometry is mostly north-south — so this is the larger of the
    // two components, not a residue that could be a rounding artefact.
    const sep = moonDisk(t, ...place).separationDeg;
    assert.ok(Math.sign(dDec) === sign, `${place}: moon should be ${where}, got ${dDec}°`);
    assert.ok(Math.abs(dDec) > 0.7 * sep, `${place}: ${dDec}° of ${sep}° is too flat`);
  }
});

// The moon overtakes the sun eastwards, so the sun is bitten on its western
// limb first and the last sliver of it is the eastern one.
test('the moon crosses the sun from west to east', () => {
  const lc = localCircumstances(...BARCELONA);
  const hourAngleGap = utcMs => {
    const [moon, sun] = [moonDisk(utcMs, ...BARCELONA), sunPosition(utcMs, ...BARCELONA)];
    return equatorialOf(moon, BARCELONA[0]).hourAngleDeg -
      equatorialOf(sun, BARCELONA[0]).hourAngleDeg;
  };
  // West is the greater hour angle: ahead of the sun at C1, behind it at C4.
  assert.ok(hourAngleGap(lc.c1.utcMs) > 0, String(hourAngleGap(lc.c1.utcMs)));
  assert.ok(hourAngleGap(lc.c4.utcMs) < 0, String(hourAngleGap(lc.c4.utcMs)));
  let prev = Infinity;
  for (let ms = lc.c1.utcMs; ms <= lc.c4.utcMs; ms += 60000) {
    assert.ok(hourAngleGap(ms) < prev, `not monotonic at ${new Date(ms).toISOString()}`);
    prev = hourAngleGap(ms);
  }
});

// The moon slides past the sun for hours, so the disk must be drawable outside
// the contacts too — but never outside the window the elements cover.
test('the disk exists across the elements’ window and nowhere else', () => {
  const el = ECLIPSE_2026_08_12;
  const [h0, h1] = el.validTdtHours;
  const hourMs = 3600000;
  const t0 = el.t0UtcMs - ((el.t0UtcMs / hourMs) % 24) * hourMs; // midnight of the eclipse day, UT
  assert.ok(moonDisk(t0 + (h0 + 0.1) * hourMs, ...BARCELONA) !== null);
  assert.ok(moonDisk(t0 + (h1 - 0.1) * hourMs, ...BARCELONA) !== null);
  assert.equal(moonDisk(t0 + (h0 - 0.1) * hourMs, ...BARCELONA), null);
  assert.equal(moonDisk(t0 + (h1 + 0.1) * hourMs, ...BARCELONA), null);
  assert.equal(moonDisk(Date.UTC(2026, 7, 11, 18, 30), ...BARCELONA), null);
  assert.equal(moonDisk(Date.UTC(2026, 7, 13, 18, 30), ...BARCELONA), null);
  // Well before first contact the disks are clear of each other, yet close
  // enough to be worth drawing: this is one lunation's worth of approach.
  const early = moonDisk(t0 + (h0 + 0.1) * hourMs, ...BARCELONA);
  assert.ok(early.obscuration === 0);
  assert.ok(early.separationDeg > 0.6 && early.separationDeg < 4, String(early.separationDeg));
});

// Obscuration is an area, not a diameter: at the moment the moon's centre
// crosses the sun's, the covered area must exceed the covered diameter.
test('obscuration runs monotonically to 1 and back', () => {
  const lc = localCircumstances(...CENTRAL_LINE);
  let prev = -1;
  for (let ms = lc.c1.utcMs; ms <= lc.c2.utcMs; ms += 5000) {
    const o = moonDisk(ms, ...CENTRAL_LINE).obscuration;
    assert.ok(o >= prev, `dropped at ${new Date(ms).toISOString()}`);
    prev = o;
  }
  prev = 2;
  for (let ms = lc.c3.utcMs; ms <= lc.c4.utcMs; ms += 5000) {
    const o = moonDisk(ms, ...CENTRAL_LINE).obscuration;
    assert.ok(o <= prev, `rose at ${new Date(ms).toISOString()}`);
    prev = o;
  }
  // Half the diameter covered hides distinctly less than half the area.
  const half = moonDisk(lc.max.utcMs, 41.9794, 2.8214); // Girona, magnitude ~0.99
  assert.ok(half.obscuration > 0.8 && half.obscuration < 1);
});
