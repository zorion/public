// Geodesy and slippy-tile math. Pure functions, no I/O.

export const EARTH_RADIUS_M = 6371008.8;

// Standard optical refraction coefficient for terrestrial sight lines;
// effective Earth radius R/(1-k) folds refraction into the curvature drop.
export const REFRACTION_COEFF = 0.13;
export const EFFECTIVE_EARTH_RADIUS_M = EARTH_RADIUS_M / (1 - REFRACTION_COEFF);

const DEG = Math.PI / 180;

export function toRad(deg) { return deg * DEG; }
export function toDeg(rad) { return rad / DEG; }

export function normalizeDeg(deg) {
  return ((deg % 360) + 360) % 360;
}

// Destination point at `distanceM` along `bearingDeg` from (latDeg, lonDeg),
// on a sphere. Ellipsoidal error over 200 km is far below terrain-data error.
export function destinationPoint(latDeg, lonDeg, bearingDeg, distanceM) {
  const delta = distanceM / EARTH_RADIUS_M;
  const theta = toRad(bearingDeg);
  const phi1 = toRad(latDeg);
  const lambda1 = toRad(lonDeg);
  const sinPhi2 = Math.sin(phi1) * Math.cos(delta) +
    Math.cos(phi1) * Math.sin(delta) * Math.cos(theta);
  const phi2 = Math.asin(sinPhi2);
  const lambda2 = lambda1 + Math.atan2(
    Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
    Math.cos(delta) - Math.sin(phi1) * sinPhi2,
  );
  return { lat: toDeg(phi2), lon: normalizeDeg(toDeg(lambda2) + 180) - 180 };
}

// Great-circle distance in meters.
export function haversineDistance(lat1, lon1, lat2, lon2) {
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dPhi = toRad(lat2 - lat1);
  const dLambda = toRad(lon2 - lon1);
  const a = Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

// Web-mercator tile coordinates (fractional) for a zoom level.
export function lonLatToTile(lonDeg, latDeg, z) {
  const n = 2 ** z;
  const x = ((lonDeg + 180) / 360) * n;
  const phi = toRad(latDeg);
  const y = (1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2 * n;
  return { x, y };
}

// Ground meters per pixel of a web-mercator tile at a latitude.
export function metersPerPixel(latDeg, z, tileSizePx) {
  const worldMeters = 2 * Math.PI * EARTH_RADIUS_M * Math.cos(toRad(latDeg));
  return worldMeters / (2 ** z * tileSizePx);
}

// Apparent elevation angle (degrees) of a target at `distanceM` whose ground
// height is `targetHeightM`, seen from eye height `eyeHeightM` (same datum),
// including Earth curvature and standard refraction via the effective radius.
export function apparentElevationDeg(distanceM, targetHeightM, eyeHeightM) {
  const curvatureDrop = distanceM * distanceM / (2 * EFFECTIVE_EARTH_RADIUS_M);
  return toDeg(Math.atan2(targetHeightM - eyeHeightM - curvatureDrop, distanceM));
}
