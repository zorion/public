// Local circumstances of the total solar eclipse of 2026-08-12, computed
// from NASA's published polynomial Besselian elements (eclipse.gsfc.nasa.gov,
// fetched 2026-07-19). Method: Explanatory Supplement / Meeus, "Elements of
// Solar Eclipses". Pure functions, no I/O.

import { toRad, toDeg } from './geo.js';
import { sunPosition } from './solar.js';

// t0 = 2026-08-12 18:00:00 TDT; elements valid for 15h ≤ TDT ≤ 21h.
// Polynomials are evaluated at t = hours since t0 (in TDT).
export const ECLIPSE_2026_08_12 = {
  label: 'Eclipse total de Sol — 12 de agosto de 2026',
  t0UtcMs: Date.UTC(2026, 7, 12, 18, 0, 0), // 18:00 TDT expressed on the UTC scale, ΔT applied below
  deltaTSeconds: 71.4,
  x: [0.475593, 0.5189288, -0.0000773, -0.0000088],
  y: [0.771161, -0.2301664, -0.0001245, 0.0000037],
  dDeg: [14.79667, -0.012065, -0.000003],
  l1: [0.537954, 0.000094, -0.0000121],
  l2: [-0.008142, 0.0000935, -0.0000121],
  muDeg: [88.74776, 15.003093],
  tanF1: 0.0046141,
  tanF2: 0.0045911,
  validTdtHours: [15, 21],
};

const EARTH_B_OVER_A = 0.99664719;

function poly(coeffs, t) {
  let v = 0;
  for (let i = coeffs.length - 1; i >= 0; i--) v = v * t + coeffs[i];
  return v;
}

function polyDeriv(coeffs, t) {
  let v = 0;
  for (let i = coeffs.length - 1; i >= 1; i--) v = v * t + coeffs[i] * i;
  return v;
}

// Hours since t0 (TDT) for a UTC instant.
function tOfUtcMs(el, msUTC) {
  return (msUTC + el.deltaTSeconds * 1000 - el.t0UtcMs) / 3600000;
}

function utcMsOfT(el, t) {
  return el.t0UtcMs + t * 3600000 - el.deltaTSeconds * 1000;
}

// Observer geocentric coordinates in the fundamental (shadow) plane frame,
// with their time derivatives. latDeg/lonDeg geodetic, lonDeg east-positive.
function observerState(el, t, latDeg, lonDeg, heightM) {
  const dDeg = poly(el.dDeg, t);
  const d = toRad(dDeg);
  const muDeg = poly(el.muDeg, t);
  const muDot = toRad(polyDeriv(el.muDeg, t)); // rad/h
  const dDot = toRad(polyDeriv(el.dDeg, t)); // rad/h

  const phi = toRad(latDeg);
  const u = Math.atan(EARTH_B_OVER_A * Math.tan(phi));
  const hOverA = heightM / 6378137;
  const rhoSinPhiP = EARTH_B_OVER_A * Math.sin(u) + hOverA * Math.sin(phi);
  const rhoCosPhiP = Math.cos(u) + hOverA * Math.cos(phi);

  const theta = toRad(muDeg + lonDeg);
  const xi = rhoCosPhiP * Math.sin(theta);
  const eta = rhoSinPhiP * Math.cos(d) - rhoCosPhiP * Math.cos(theta) * Math.sin(d);
  const zeta = rhoSinPhiP * Math.sin(d) + rhoCosPhiP * Math.cos(theta) * Math.cos(d);

  const xiDot = muDot * rhoCosPhiP * Math.cos(theta);
  const etaDot = muDot * xi * Math.sin(d) - zeta * dDot;

  return { xi, eta, zeta, xiDot, etaDot };
}

// Separation state between shadow axis and observer at time t.
function shadowState(el, t, latDeg, lonDeg, heightM) {
  const o = observerState(el, t, latDeg, lonDeg, heightM);
  const u = poly(el.x, t) - o.xi;
  const v = poly(el.y, t) - o.eta;
  const uDot = polyDeriv(el.x, t) - o.xiDot;
  const vDot = polyDeriv(el.y, t) - o.etaDot;
  const L1 = poly(el.l1, t) - o.zeta * el.tanF1; // penumbral radius here
  const L2 = poly(el.l2, t) - o.zeta * el.tanF2; // umbral radius here (<0: total)
  return { u, v, uDot, vDot, L1, L2, zeta: o.zeta };
}

// Time of maximum eclipse (t hours from t0), by Newton iteration.
function findMaximum(el, latDeg, lonDeg, heightM) {
  let t = 0;
  for (let i = 0; i < 20; i++) {
    const s = shadowState(el, t, latDeg, lonDeg, heightM);
    const n2 = s.uDot * s.uDot + s.vDot * s.vDot;
    const tau = -(s.u * s.uDot + s.v * s.vDot) / n2;
    t += tau;
    if (Math.abs(tau) < 1e-8) break;
  }
  return t;
}

// Contact time where |(u,v)| equals the radius L (L1 penumbra, |L2| umbra).
// `sign` -1 for the earlier contact, +1 for the later. Returns null when the
// shadow circle never reaches the observer (discriminant < 0).
function findContact(el, latDeg, lonDeg, heightM, useUmbra, sign, tStart) {
  let t = tStart;
  for (let i = 0; i < 20; i++) {
    const s = shadowState(el, t, latDeg, lonDeg, heightM);
    const L = useUmbra ? Math.abs(s.L2) : s.L1;
    const n = Math.hypot(s.uDot, s.vDot);
    const S = (s.u * s.vDot - s.v * s.uDot) / (n * L);
    const disc = 1 - S * S;
    if (disc < 0) return null;
    const tau = -(s.u * s.uDot + s.v * s.vDot) / (n * n) +
      sign * (L / n) * Math.sqrt(disc);
    t += tau;
    if (Math.abs(tau) < 1e-8) return t;
  }
  return t;
}

function eventAt(el, t, latDeg, lonDeg) {
  const utcMs = utcMsOfT(el, t);
  const sun = sunPosition(utcMs, latDeg, lonDeg);
  return {
    utcMs,
    altitudeDeg: sun.altitudeDeg,
    apparentAltitudeDeg: sun.apparentAltitudeDeg,
    azimuthDeg: sun.azimuthDeg,
  };
}

// Local circumstances of the eclipse at a location.
// Returns { visible: false } when no eclipse occurs there at all.
export function localCircumstances(latDeg, lonDeg, heightM = 0, el = ECLIPSE_2026_08_12) {
  const tMax = findMaximum(el, latDeg, lonDeg, heightM);
  const s = shadowState(el, tMax, latDeg, lonDeg, heightM);
  const m = Math.hypot(s.u, s.v);

  if (m >= s.L1) return { visible: false };

  const isTotal = m < Math.abs(s.L2);
  const magnitude = isTotal
    ? (s.L1 - s.L2) / (s.L1 + s.L2)
    : (s.L1 - m) / (s.L1 + s.L2);

  const tC1 = findContact(el, latDeg, lonDeg, heightM, false, -1, tMax);
  const tC4 = findContact(el, latDeg, lonDeg, heightM, false, +1, tMax);
  const tC2 = isTotal ? findContact(el, latDeg, lonDeg, heightM, true, -1, tMax) : null;
  const tC3 = isTotal ? findContact(el, latDeg, lonDeg, heightM, true, +1, tMax) : null;

  return {
    visible: true,
    isTotal,
    magnitude,
    max: eventAt(el, tMax, latDeg, lonDeg),
    c1: tC1 === null ? null : eventAt(el, tC1, latDeg, lonDeg),
    c2: tC2 === null ? null : eventAt(el, tC2, latDeg, lonDeg),
    c3: tC3 === null ? null : eventAt(el, tC3, latDeg, lonDeg),
    c4: tC4 === null ? null : eventAt(el, tC4, latDeg, lonDeg),
    totalityDurationS: (tC2 !== null && tC3 !== null) ? (tC3 - tC2) * 3600 : 0,
  };
}
