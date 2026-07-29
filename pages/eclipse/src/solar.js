// Solar position, NOAA/Meeus low-accuracy series (~0.01° for 1900–2100).
// Pure functions, no I/O. Angles in degrees unless noted.

import { toRad, toDeg, normalizeDeg } from './geo.js';

export const SUN_SEMIDIAMETER_1AU_DEG = 0.266563; // 959.63" at 1 AU

export function julianDay(msUTC) {
  return msUTC / 86400000 + 2440587.5;
}

// Geocentric apparent sun: declination, right ascension, Greenwich hour
// angle, distance. Nutation folded in via the low-precision Ω term.
export function sunEquatorial(msUTC) {
  const jd = julianDay(msUTC);
  const T = (jd - 2451545) / 36525;

  const L0 = normalizeDeg(280.46646 + 36000.76983 * T + 0.0003032 * T * T);
  const M = normalizeDeg(357.52911 + 35999.05029 * T - 0.0001537 * T * T);
  const e = 0.016708634 - 0.000042037 * T - 0.0000001267 * T * T;

  const C =
    (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(toRad(M)) +
    (0.019993 - 0.000101 * T) * Math.sin(toRad(2 * M)) +
    0.000289 * Math.sin(toRad(3 * M));

  const trueLong = L0 + C;
  const trueAnomaly = M + C;
  const distanceAU = 1.000001018 * (1 - e * e) /
    (1 + e * Math.cos(toRad(trueAnomaly)));

  const omega = 125.04 - 1934.136 * T;
  const apparentLong = trueLong - 0.00569 - 0.00478 * Math.sin(toRad(omega));

  const eps0 = 23.43929111 - 0.01300417 * T - 1.63889e-7 * T * T + 5.03611e-7 * T ** 3;
  const eps = eps0 + 0.00256 * Math.cos(toRad(omega));

  const lam = toRad(apparentLong);
  const raDeg = normalizeDeg(toDeg(Math.atan2(Math.cos(toRad(eps)) * Math.sin(lam), Math.cos(lam))));
  const declinationDeg = toDeg(Math.asin(Math.sin(toRad(eps)) * Math.sin(lam)));

  const gmst = normalizeDeg(
    280.46061837 + 360.98564736629 * (jd - 2451545) +
    0.000387933 * T * T - T ** 3 / 38710000,
  );
  const nutationLongDeg = -0.00478 * Math.sin(toRad(omega));
  const gast = normalizeDeg(gmst + nutationLongDeg * Math.cos(toRad(eps)));
  const ghaDeg = normalizeDeg(gast - raDeg);

  return { declinationDeg, raDeg, ghaDeg, distanceAU };
}

// Atmospheric refraction lift (degrees) for a GEOMETRIC altitude, standard
// atmosphere (Sæmundsson). Clamped below -1°, where the formula degenerates
// and the sun is invisible anyway.
export function refractionDeg(altitudeDeg) {
  const h = Math.max(altitudeDeg, -1);
  return 1.02 / Math.tan(toRad(h + 10.3 / (h + 5.11))) / 60;
}

// Any body's azimuth and elevation from its declination and Greenwich hour
// angle, as seen from (latDeg, lonDeg east-positive). altitudeDeg is geometric
// (airless); apparentAltitudeDeg adds this body's own refraction.
export function horizontalPosition(declinationDeg, ghaDeg, latDeg, lonDeg) {
  const H = toRad(normalizeDeg(ghaDeg + lonDeg));
  const phi = toRad(latDeg);
  const dec = toRad(declinationDeg);

  const sinAlt = Math.sin(phi) * Math.sin(dec) +
    Math.cos(phi) * Math.cos(dec) * Math.cos(H);
  const altitudeDeg = toDeg(Math.asin(sinAlt));

  const azFromSouth = Math.atan2(
    Math.sin(H),
    Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi),
  );

  return {
    altitudeDeg,
    apparentAltitudeDeg: altitudeDeg + refractionDeg(altitudeDeg),
    azimuthDeg: normalizeDeg(toDeg(azFromSouth) + 180),
  };
}

// Sun as seen from (latDeg, lonDeg east-positive) at msUTC.
// Solar parallax (≤0.0024°) is ignored.
export function sunPosition(msUTC, latDeg, lonDeg) {
  const eq = sunEquatorial(msUTC);
  return {
    ...eq,
    ...horizontalPosition(eq.declinationDeg, eq.ghaDeg, latDeg, lonDeg),
    semiDiameterDeg: SUN_SEMIDIAMETER_1AU_DEG / eq.distanceAU,
  };
}
