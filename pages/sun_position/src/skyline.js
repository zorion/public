// Skyline computation: for each azimuth, the maximum apparent elevation of
// terrain along the ray, with Earth curvature and standard refraction folded
// in. Data access is injected, so this module is pure and testable.

import { destinationPoint, apparentElevationDeg } from './geo.js';

export const EYE_HEIGHT_M = 1.7;
export const SELF_OCCLUSION_GUARD_M = 30;

// Terrain skyline over [azFromDeg, azToDeg] (step azStepDeg), marching each
// ray from `minDistanceM` out to `maxDistanceM`. `sampleTerrain(lat, lon,
// distanceM) → meters|null` supplies ground heights (async).
// Returns { azimuths: [{azimuthDeg, elevationDeg, ridgeDistanceM}] }.
export async function computeSkyline({
  latDeg, lonDeg, eyeElevM,
  azFromDeg, azToDeg, azStepDeg = 0.25,
  minDistanceM = SELF_OCCLUSION_GUARD_M,
  maxDistanceM = 200000,
  sampleTerrain,
}) {
  const azimuths = [];
  for (let az = azFromDeg; az <= azToDeg + 1e-9; az += azStepDeg) {
    let best = -90;
    let ridge = null;
    for (let d = minDistanceM; d <= maxDistanceM; d += Math.max(15, d / 100)) {
      const p = destinationPoint(latDeg, lonDeg, az, d);
      const h = await sampleTerrain(p.lat, p.lon, d);
      if (h === null) continue;
      const elev = apparentElevationDeg(d, h, eyeElevM);
      if (elev > best) {
        best = elev;
        ridge = d;
      }
      // Nothing farther along the ray can beat `best` once even a 9000 m
      // peak at distance d would appear lower: prune the tail.
      if (apparentElevationDeg(d, 9000, eyeElevM) < best && d > 1000) break;
    }
    azimuths.push({ azimuthDeg: az, elevationDeg: best, ridgeDistanceM: ridge });
  }
  return { azimuths };
}

// Near-field obstruction profile from point-sampled surface heights
// (buildings + vegetation) inside a narrow wedge. `sampleSurface(lat, lon)
// → meters|null` is one GetFeatureInfo query; the distance ladder keeps the
// request count small (~9 per azimuth).
export const NEAR_FIELD_DISTANCES_M = [40, 60, 90, 135, 200, 300, 450, 675, 1000];

export async function computeNearField({
  latDeg, lonDeg, eyeElevM,
  azFromDeg, azToDeg, azStepDeg = 1,
  distancesM = NEAR_FIELD_DISTANCES_M,
  sampleSurface,
}) {
  const azimuths = [];
  for (let az = azFromDeg; az <= azToDeg + 1e-9; az += azStepDeg) {
    let best = -90;
    let ridge = null;
    for (const d of distancesM) {
      if (d < SELF_OCCLUSION_GUARD_M) continue;
      const p = destinationPoint(latDeg, lonDeg, az, d);
      const h = await sampleSurface(p.lat, p.lon);
      if (h === null) continue;
      const elev = apparentElevationDeg(d, h, eyeElevM);
      if (elev > best) {
        best = elev;
        ridge = d;
      }
    }
    azimuths.push({ azimuthDeg: az, elevationDeg: best, ridgeDistanceM: ridge });
  }
  return { azimuths };
}

// Skyline elevation at an arbitrary azimuth, linearly interpolated.
// Returns null outside the computed range.
export function skylineAt(skyline, azimuthDeg) {
  const a = skyline.azimuths;
  if (!a.length || azimuthDeg < a[0].azimuthDeg || azimuthDeg > a[a.length - 1].azimuthDeg) {
    return null;
  }
  let lo = 0;
  let hi = a.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (a[mid].azimuthDeg <= azimuthDeg) lo = mid; else hi = mid;
  }
  const span = a[hi].azimuthDeg - a[lo].azimuthDeg;
  const f = span === 0 ? 0 : (azimuthDeg - a[lo].azimuthDeg) / span;
  return a[lo].elevationDeg * (1 - f) + a[hi].elevationDeg * f;
}

// Occlusion combines terrain and (optional) near-field profiles.
export function obstructionAt(terrainSkyline, nearField, azimuthDeg) {
  const t = skylineAt(terrainSkyline, azimuthDeg);
  const n = nearField ? skylineAt(nearField, azimuthDeg) : null;
  if (t === null) return n;
  if (n === null) return t;
  return Math.max(t, n);
}

// Is the sun (apparent altitude, azimuth) visible above the obstruction?
export function sunVisible(terrainSkyline, nearField, azimuthDeg, apparentAltitudeDeg) {
  const limit = obstructionAt(terrainSkyline, nearField, azimuthDeg);
  if (limit === null) return null; // unknown — outside computed window
  return apparentAltitudeDeg > limit;
}
