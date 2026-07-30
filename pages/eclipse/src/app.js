// Page wiring: state, skyline orchestration, canvas rendering, verdict.

import { sunPosition } from './solar.js';
import { localCircumstances, moonDisk } from './eclipse.js';
import { sampleHeight, inCatalonia } from './heights.js';
import {
  computeSkyline, computeNearField, obstructionAt, sunVisible, EYE_HEIGHT_M,
  NEAR_FIELD_DISTANCES_M,
} from './skyline.js';
import { makeGridLoader, makeSurfaceSampler, makeTileImageSource, geocode } from './providers.js';
import { destinationPoint } from './geo.js';
import { parseShareParams, shareQuery } from './share.js';
import { OSM_TILE } from './map.js';
import { createMapPicker } from './mapview.js';
import { LANGS, DEFAULT_LANG, localeOf, translate } from './i18n.js';

const AZ_MIN = 230;
const AZ_MAX = 330;
const AZ_STEP = 0.25;
const NEAR_FIELD_HALF_WEDGE_DEG = 8;
const ECLIPSE_DATE = '2026-08-12';
// Below this the sun is set, and a direction arrow on the map means nothing.
const SUN_RAY_MIN_ALTITUDE_DEG = -1;
// How far the drawn corona reaches, in lunar radii. Not a measurement: the real
// corona fades out over several degrees, far past anything this scale can hold.
const CORONA_RADII = 3.2;

const PRESETS = [
  { name: 'Barcelona', lat: 41.3874, lon: 2.1686 },
  { name: 'Girona', lat: 41.9794, lon: 2.8214 },
  { name: 'Lleida', lat: 41.6176, lon: 0.62 },
  { name: 'Tarragona', lat: 41.1189, lon: 1.2445 },
  { name: 'Tibidabo (Barcelona)', lat: 41.4225, lon: 2.1187 },
  { name: 'Montserrat — Sant Jeroni', lat: 41.6053, lon: 1.8106 },
  { name: 'Àger (Montsec)', lat: 42.005, lon: 0.913 },
  { name: "Delta de l'Ebre", lat: 40.71, lon: 0.7 },
  { name: 'Cap de Creus', lat: 42.3238, lon: 3.317 },
];

const $ = id => document.getElementById(id);
const canvas = $('panorama');
const ctx = canvas.getContext('2d');

const loadGrid = makeGridLoader(n => setStatus(t('status.tiles', { n })));
const sampleSurface = makeSurfaceSampler();
const tileSource = makeTileImageSource(OSM_TILE);
let picker = null;

const state = {
  lat: PRESETS[0].lat,
  lon: PRESETS[0].lon,
  extraHeightM: 0,
  lang: DEFAULT_LANG,
  dateStr: ECLIPSE_DATE,
  // Seconds, not minutes: contact times land mid-minute and totality lasts
  // ~90 s, so rounding C2 to its minute can miss totality altogether.
  secondOfDay: (20 * 60 + 29) * 60,
  groundElevM: null,
  eyeElevM: null,
  terrainSkyline: null,
  nearField: null,
  eclipse: null,
  viewCenterAz: 286,
  computeToken: 0,
};

// ---------- language ----------

// Read through `state` on every call, so switching language needs no rebuilding
// of anything that holds a translator.
const t = (key, params) => translate(state.lang, key, params);

// index.html carries the Spanish original for the first paint; these attributes
// say which message replaces it. `data-i18n` sets textContent, `data-i18n-html`
// innerHTML, and any other suffix the attribute of that (kebab-cased) name.
const I18N_SELECTOR = '[data-i18n],[data-i18n-html],[data-i18n-title],'
  + '[data-i18n-placeholder],[data-i18n-aria-label]';
const I18N_PREFIX = 'i18n';

const kebab = s => s.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`).replace(/^-/, '');

// Everything whose wording is fixed for the session but for the language: the
// static markup, the tab title, and the two lists app.js builds itself.
function applyLanguage() {
  document.documentElement.lang = state.lang;
  document.title = t('page.title');

  for (const el of document.querySelectorAll(I18N_SELECTOR)) {
    for (const [dataKey, msgKey] of Object.entries(el.dataset)) {
      if (!dataKey.startsWith(I18N_PREFIX)) continue;
      const target = dataKey.slice(I18N_PREFIX.length);
      if (target === '') el.textContent = t(msgKey);
      else if (target === 'Html') el.innerHTML = t(msgKey);
      else el.setAttribute(kebab(target), t(msgKey));
    }
  }

  renderPresetOptions();
  syncLangLinks();
  $('tz-note').textContent =
    t('time.tzNote', { tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
}

// Place names are never translated, so only the "no preset" entry changes — but
// rebuilding the list drops the selection, which has to be put back.
function renderPresetOptions() {
  const sel = $('preset');
  const chosen = sel.value;
  sel.innerHTML = `<option value="-1">${t('preset.custom')}</option>` +
    PRESETS.map((p, i) => `<option value="${i}">${p.name}</option>`).join('');
  if (chosen) sel.value = chosen;
}

// Links rather than a <select>, so each language is a real URL a visitor can
// share or bookmark. The click is intercepted all the same: re-translating in
// place is instant, where a reload would re-fetch every elevation tile for a
// spot whose skyline is already computed.
function initLangSwitch() {
  $('lang-switch').append(...LANGS.map(({ code, name }) => {
    const a = document.createElement('a');
    a.textContent = name;
    a.hreflang = code;
    a.dataset.lang = code;
    a.addEventListener('click', e => {
      e.preventDefault();
      setLang(code);
    });
    return a;
  }));
}

// Each link points at the current spot in its own language, so following one is
// the same page rather than a reset to Barcelona.
function syncLangLinks() {
  for (const a of $('lang-switch').children) {
    const code = a.dataset.lang;
    a.href = `${location.pathname}?${shareQuery({ ...state, lang: code })}`;
    if (code === state.lang) a.setAttribute('aria-current', 'true');
    else a.removeAttribute('aria-current');
  }
}

function setLang(lang) {
  if (lang === state.lang) return;
  state.lang = lang;
  syncUrl();
  applyLanguage();
  // Transient text answers a request already served in the old language;
  // clearing it beats leaving it on screen in the wrong one.
  setStatus('');
  $('readout').textContent = '';
  $('place-status').textContent = '';
  renderAll();
  picker?.refresh();
}

// ---------- time helpers (everything shown in the browser's timezone) ----------

function selectedUtcMs() {
  const [y, m, d] = state.dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, state.secondOfDay).getTime();
}

function fmtTime(ms, withSeconds = false) {
  return new Date(ms).toLocaleTimeString(localeOf(state.lang), {
    hour: '2-digit', minute: '2-digit', ...(withSeconds ? { second: '2-digit' } : {}),
  });
}

const pad2 = n => String(n).padStart(2, '0');

// The timeline label. Seconds appear only when the selected instant has them —
// that is what tells the visitor they are on C2 exactly, not on its minute.
function fmtSelected() {
  const s = state.secondOfDay % 60;
  const hhmm = `${pad2(Math.floor(state.secondOfDay / 3600))}:${pad2(Math.floor(state.secondOfDay / 60) % 60)}`;
  return s ? `${hhmm}:${pad2(s)}` : hhmm;
}

// ---------- skyline computation ----------

function setStatus(msg) { $('status').textContent = msg; }

async function recomputeLocation() {
  const token = ++state.computeToken;
  const { lat, lon } = state;
  state.terrainSkyline = null;
  state.nearField = null;
  state.eclipse = localCircumstances(lat, lon);
  renderAll();

  setStatus(t('status.groundElevation'));
  const ground = await sampleHeight(loadGrid, lat, lon, 0);
  if (token !== state.computeToken) return;
  state.groundElevM = ground ?? 0;
  state.eyeElevM = state.groundElevM + EYE_HEIGHT_M + state.extraHeightM;

  setStatus(t('status.terrainHorizon'));
  const guard = async (la, lo, d) => {
    if (token !== state.computeToken) throw new Error('stale');
    return sampleHeight(loadGrid, la, lo, d);
  };
  try {
    state.terrainSkyline = await computeSkyline({
      latDeg: lat, lonDeg: lon, eyeElevM: state.eyeElevM,
      azFromDeg: AZ_MIN, azToDeg: AZ_MAX, azStepDeg: AZ_STEP,
      sampleTerrain: guard,
    });
  } catch { return; }
  if (token !== state.computeToken) return;
  setStatus('');
  renderAll();

  await recomputeNearField(token);
  if (token === state.computeToken) renderAll();
}

// Buildings and vegetation, only inside Catalonia and only in the wedge the
// sun sweeps during the eclipse (that is where the answer gets decided).
async function recomputeNearField(token) {
  const { lat, lon } = state;
  if (!inCatalonia(lat, lon) || !state.eclipse?.visible) return;
  const azCenter = Math.round(state.eclipse.max.azimuthDeg);
  const azFrom = azCenter - NEAR_FIELD_HALF_WEDGE_DEG;
  const azTo = azCenter + NEAR_FIELD_HALF_WEDGE_DEG;

  // Warm the point cache in parallel batches; computeNearField then runs on
  // cache hits. ~17 azimuths × 9 distances ≈ 150 point queries.
  const points = [];
  for (let az = azFrom; az <= azTo; az++) {
    for (const d of NEAR_FIELD_DISTANCES_M) {
      const p = destinationPoint(lat, lon, az, d);
      points.push(p);
    }
  }
  setStatus(t('status.surface'));
  const BATCH = 12;
  for (let i = 0; i < points.length; i += BATCH) {
    if (token !== state.computeToken) return;
    await Promise.all(points.slice(i, i + BATCH).map(p => sampleSurface(p.lat, p.lon)));
    setStatus(t('status.surfaceProgress', {
      done: Math.min(i + BATCH, points.length), total: points.length,
    }));
  }
  if (token !== state.computeToken) return;
  state.nearField = await computeNearField({
    latDeg: lat, lonDeg: lon, eyeElevM: state.eyeElevM,
    azFromDeg: azFrom, azToDeg: azTo, azStepDeg: 1,
    sampleSurface,
  });
  setStatus('');
}

// ---------- verdict ----------

function visibilityOf(event) {
  if (!state.terrainSkyline || !event) return null;
  return sunVisible(state.terrainSkyline, state.nearField, event.azimuthDeg, event.apparentAltitudeDeg);
}

// Visibility is three-valued: until this Location's skyline has arrived it is
// *unknown*, which must never be worded or coloured as "occluded" — the terrain
// that would hide the sun is not drawn yet either, so a red verdict at this
// point contradicts the panorama right below it.
const pendingHorizon = () => `<span class="pending">${t('verdict.pendingHorizon')}</span>`;

function visLabel(v) {
  if (v === null) return `<span class="pending" title="${t('verdict.pendingShort')}">…</span>`;
  return v
    ? `<strong class="good">${t('verdict.visible')}</strong>`
    : `<strong class="bad">${t('verdict.occluded')}</strong>`;
}

// Last moment of the selected day when the sun's upper limb clears the local
// obstruction — the "effective sunset" behind the real skyline.
function effectiveSunsetMs() {
  if (!state.terrainSkyline) return null;
  const [y, m, d] = state.dateStr.split('-').map(Number);
  const start = new Date(y, m - 1, d, 12, 0).getTime();
  let last = null;
  for (let ms = start; ms < start + 12 * 3600000; ms += 30000) {
    const s = sunPosition(ms, state.lat, state.lon);
    if (s.azimuthDeg < AZ_MIN || s.azimuthDeg > AZ_MAX) continue;
    const limit = obstructionAt(state.terrainSkyline, state.nearField, s.azimuthDeg);
    if (limit !== null && s.apparentAltitudeDeg + s.semiDiameterDeg > limit) last = ms;
    if (s.apparentAltitudeDeg < -2) break;
  }
  return last;
}

// Every clock reading the verdict shows is somewhere the visitor may want the
// sun to be, so each one is a control that moves the timeline there.
function atTime(utcMs, withSeconds = false) {
  return `<button type="button" class="at-time" data-utc-ms="${utcMs}"
    title="${t('verdict.atTimeHint')}">${fmtTime(utcMs, withSeconds)}</button>`;
}

function renderVerdict() {
  const el = $('verdict');
  const lc = state.eclipse;
  const isEclipseDay = state.dateStr === ECLIPSE_DATE;
  const skylineKnown = state.terrainSkyline !== null;
  const sunset = effectiveSunsetMs();
  const sunsetLine = sunset ? t('verdict.localSunset', { time: atTime(sunset) }) : '';

  if (!isEclipseDay) {
    const s = sunPosition(selectedUtcMs(), state.lat, state.lon);
    const where = t('verdict.sunAt', {
      time: fmtTime(selectedUtcMs(), state.secondOfDay % 60 !== 0),
      altitude: s.apparentAltitudeDeg.toFixed(1),
      azimuth: s.azimuthDeg.toFixed(1),
    });
    el.className = 'panel';
    el.innerHTML = skylineKnown
      ? `${where} — ${visLabel(visibilityOf(s))}. ${sunsetLine}`
      : `${where}. ${pendingHorizon()}`;
    return;
  }

  // Not computed yet is not the same as "not visible from here".
  if (!lc) {
    el.className = 'panel';
    el.innerHTML = pendingHorizon();
    return;
  }

  if (!lc.visible) {
    el.className = 'panel bad';
    el.textContent = t('verdict.notVisibleHere');
    return;
  }

  const rows = [
    [t('verdict.c1'), lc.c1],
    [t('verdict.c2'), lc.c2],
    [t('verdict.max'), lc.max],
    [t('verdict.c3'), lc.c3],
    [t('verdict.c4'), lc.c4],
  ].filter(([, e]) => e).map(([label, e]) => {
    const v = visibilityOf(e);
    return `<tr><th>${label}</th><td>${atTime(e.utcMs, true)}</td>
      <td>${e.apparentAltitudeDeg.toFixed(1)}°</td><td>${visLabel(v)}</td></tr>`;
  }).join('');

  let headline;
  if (lc.isTotal) {
    const v2 = visibilityOf(lc.c2);
    const v3 = visibilityOf(lc.c3);
    const seconds = Math.round(lc.totalityDurationS);
    if (!skylineKnown) {
      el.className = 'panel';
      headline = `${t('verdict.totalityDuration', { seconds })} ${pendingHorizon()}`;
    } else if (v2 && v3) {
      el.className = 'panel good';
      headline = t('verdict.totalVisible', { seconds });
    } else if (v2 || v3) {
      el.className = 'panel bad';
      headline = t('verdict.totalPartly', { seconds });
    } else {
      el.className = 'panel bad';
      headline = t('verdict.totalHidden', { seconds });
    }
  } else {
    el.className = 'panel';
    headline = t('verdict.partial', {
      magnitude: (lc.magnitude * 100).toFixed(1),
      time: atTime(lc.max.utcMs, true),
    }) + (skylineKnown ? `, ${visLabel(visibilityOf(lc.max))}.` : `. ${pendingHorizon()}`);
  }

  // One pending message at a time: while the terrain horizon is still unknown,
  // saying buildings have not been queried yet adds noise, not information.
  const nfNote = !skylineKnown || state.nearField
    ? ''
    : `<p class="note">${inCatalonia(state.lat, state.lon)
      ? t('verdict.buildingsPending')
      : t('verdict.outsideCatalonia')}</p>`;

  el.innerHTML = `${headline}<table>
    <tr><th></th><th>${t('verdict.colTime')}</th><th>${t('verdict.colAltitude')}</th><th></th></tr>
    ${rows}</table><p class="note">${sunsetLine}</p>${nfNote}`;
}

// ---------- panorama rendering ----------

// The Moon over the sun, both already in canvas pixels. Its disk is clipped to
// the sun's, because a new moon against the sky is nothing to look at: what the
// visitor can actually see is the bite, exactly where it falls.
function drawMoonOverSun(sun, moon, isTotal) {
  if (isTotal) {
    // Nothing else is left to see at totality, and the corona is what tells the
    // visitor at a glance that this instant is the one they came for. Drawn
    // first, so the disk below covers its bright centre.
    ctx.save();
    ctx.translate(moon.x, moon.y);
    ctx.scale(moon.rx / moon.ry, 1);
    const corona = ctx.createRadialGradient(0, 0, moon.ry, 0, 0, moon.ry * CORONA_RADII);
    corona.addColorStop(0, 'rgba(226,232,255,0.5)');
    corona.addColorStop(0.3, 'rgba(200,214,255,0.15)');
    corona.addColorStop(1, 'rgba(180,200,255,0)');
    ctx.fillStyle = corona;
    ctx.beginPath();
    ctx.arc(0, 0, moon.ry * CORONA_RADII, 0, 7);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(sun.x, sun.y, sun.rx, sun.ry, 0, 0, 7);
  ctx.clip();
  ctx.fillStyle = '#1b1526';
  ctx.beginPath();
  ctx.ellipse(moon.x, moon.y, moon.rx, moon.ry, 0, 0, 7);
  ctx.fill();
  ctx.restore();
}

function renderPanorama() {
  const W = canvas.width;
  const H = canvas.height;
  const msSel = selectedUtcMs();
  const sunSel = sunPosition(msSel, state.lat, state.lon);

  if (sunSel.azimuthDeg > AZ_MIN + 5 && sunSel.azimuthDeg < AZ_MAX - 5) {
    const span = 50;
    if (Math.abs(sunSel.azimuthDeg - state.viewCenterAz) > span / 2 - 5) {
      state.viewCenterAz = sunSel.azimuthDeg;
    }
  }
  const span = 50;
  const azLeft = Math.min(Math.max(state.viewCenterAz - span / 2, AZ_MIN), AZ_MAX - span);
  const azRight = azLeft + span;

  const sky = state.terrainSkyline;
  let skyMax = 4;
  if (sky) {
    for (const a of sky.azimuths) {
      if (a.azimuthDeg >= azLeft && a.azimuthDeg <= azRight) skyMax = Math.max(skyMax, a.elevationDeg);
    }
  }
  const yMin = -1;
  const yMax = Math.min(Math.max(skyMax + 2, sunSel.apparentAltitudeDeg + 2, 6), 30);
  const xOf = az => ((az - azLeft) / span) * W;
  const yOf = e => H - ((e - yMin) / (yMax - yMin)) * H;

  // Sky.
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#1c2b4a');
  grad.addColorStop(0.7, '#4a3a52');
  grad.addColorStop(1, '#8a5a46');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Elevation gridlines.
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = '20px system-ui';
  const stepE = yMax - yMin > 15 ? 5 : 2;
  for (let e = 0; e <= yMax; e += stepE) {
    ctx.beginPath();
    ctx.moveTo(0, yOf(e));
    ctx.lineTo(W, yOf(e));
    ctx.stroke();
    ctx.fillText(`${e}°`, 8, yOf(e) - 5);
  }

  // Day track of the sun (apparent altitude), hour ticks, totality segment.
  const [y, m, d] = state.dateStr.split('-').map(Number);
  const day0 = new Date(y, m - 1, d, 0, 0).getTime();
  ctx.strokeStyle = 'rgba(255,220,140,0.6)';
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  let started = false;
  for (let ms = day0; ms < day0 + 86400000; ms += 300000) {
    const s = sunPosition(ms, state.lat, state.lon);
    if (s.azimuthDeg < azLeft || s.azimuthDeg > azRight || s.apparentAltitudeDeg < yMin - 2) continue;
    const px = xOf(s.azimuthDeg);
    const py = yOf(s.apparentAltitudeDeg);
    if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  for (let ms = day0; ms < day0 + 86400000; ms += 3600000) {
    const s = sunPosition(ms, state.lat, state.lon);
    if (s.azimuthDeg < azLeft || s.azimuthDeg > azRight || s.apparentAltitudeDeg < yMin) continue;
    ctx.fillStyle = 'rgba(255,220,140,0.8)';
    ctx.beginPath();
    ctx.arc(xOf(s.azimuthDeg), yOf(s.apparentAltitudeDeg), 4, 0, 7);
    ctx.fill();
    ctx.fillText(fmtTime(ms), xOf(s.azimuthDeg) + 8, yOf(s.apparentAltitudeDeg) - 8);
  }
  const lc = state.eclipse;
  if (state.dateStr === ECLIPSE_DATE && lc?.visible && lc.c2 && lc.c3) {
    ctx.strokeStyle = '#f87171';
    ctx.lineWidth = 5;
    ctx.beginPath();
    for (let ms = lc.c2.utcMs; ms <= lc.c3.utcMs; ms += 5000) {
      const s = sunPosition(ms, state.lat, state.lon);
      const px = xOf(s.azimuthDeg);
      const py = yOf(s.apparentAltitudeDeg);
      if (ms === lc.c2.utcMs) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  // The sun at the selected instant, with the Moon over it (drawn before
  // terrain so ridges hide both). Same heightM as `state.eclipse` above, so the
  // limbs meet at exactly the contact times the verdict prints.
  const sunX = xOf(sunSel.azimuthDeg);
  const sunY = yOf(sunSel.apparentAltitudeDeg);
  const rx = (sunSel.semiDiameterDeg / span) * W;
  const ry = (sunSel.semiDiameterDeg / (yMax - yMin)) * H;
  if (sunSel.azimuthDeg >= azLeft && sunSel.azimuthDeg <= azRight) {
    const moon = moonDisk(msSel, state.lat, state.lon);
    // The glow stands for the light still getting past the Moon, so it has to go
    // out as the disk is covered — otherwise totality would be drawn as bright
    // as noon. It fades with the cube root of what is left, not with the bare
    // fraction: the eye answers luminance by roughly that power law, and fading
    // linearly made Barcelona's 99.7% partial — still dazzling, and still the
    // wrong side of the band's edge — look just like Tarragona's totality.
    const light = Math.cbrt(1 - (moon?.obscuration ?? 0));
    const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, ry * 6);
    glow.addColorStop(0, `rgba(255,235,170,${0.55 * light})`);
    glow.addColorStop(1, 'rgba(255,235,170,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(sunX, sunY, rx * 6, ry * 6, 0, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#fff3c0';
    ctx.beginPath();
    ctx.ellipse(sunX, sunY, rx, ry, 0, 0, 7);
    ctx.fill();
    if (moon) {
      drawMoonOverSun(
        { x: sunX, y: sunY, rx, ry },
        {
          x: xOf(moon.azimuthDeg),
          y: yOf(moon.apparentAltitudeDeg),
          rx: (moon.semiDiameterDeg / span) * W,
          ry: (moon.semiDiameterDeg / (yMax - yMin)) * H,
        },
        moon.obscuration >= 1,
      );
    }
  }

  // Terrain silhouette.
  if (sky) {
    ctx.fillStyle = '#0a0e16';
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (const a of sky.azimuths) {
      if (a.azimuthDeg < azLeft - AZ_STEP || a.azimuthDeg > azRight + AZ_STEP) continue;
      ctx.lineTo(xOf(a.azimuthDeg), yOf(a.elevationDeg));
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
  }

  // Near-field (buildings/vegetation) overlay where it exceeds terrain.
  if (state.nearField) {
    ctx.fillStyle = 'rgba(214,116,60,0.45)';
    ctx.beginPath();
    ctx.moveTo(xOf(state.nearField.azimuths[0].azimuthDeg), H);
    for (const a of state.nearField.azimuths) {
      ctx.lineTo(xOf(a.azimuthDeg), yOf(a.elevationDeg));
    }
    ctx.lineTo(xOf(state.nearField.azimuths.at(-1).azimuthDeg), H);
    ctx.closePath();
    ctx.fill();
  }

  // Horizon 0° and compass.
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.setLineDash([3, 5]);
  ctx.beginPath();
  ctx.moveTo(0, yOf(0));
  ctx.lineTo(W, yOf(0));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  const compass = [[225, 'SO'], [247.5, 'OSO'], [270, 'O'], [292.5, 'ONO'], [315, 'NO']];
  for (const [az, label] of compass) {
    if (az < azLeft || az > azRight) continue;
    ctx.fillText(label, xOf(az) - 12, H - 12);
  }
  for (let az = Math.ceil(azLeft / 5) * 5; az <= azRight; az += 5) {
    ctx.fillRect(xOf(az), H - 6, 2, 6);
  }
}

function renderAll() {
  renderPanorama();
  renderVerdict();
  const sun = sunPosition(selectedUtcMs(), state.lat, state.lon);
  picker?.setSunAzimuth(
    sun.apparentAltitudeDeg > SUN_RAY_MIN_ALTITUDE_DEG ? sun.azimuthDeg : null,
  );
}

// ---------- controls ----------

// Keep the address bar shareable: it always encodes the current spot and, when
// it is not the default, the language.
function syncUrl() {
  history.replaceState(null, '', `${location.pathname}?${shareQuery(state)}`);
  syncLangLinks();
}

// `recenterMap: false` is for picks that came from the map itself — the view is
// already where the visitor put it.
function setLocation(lat, lon, { presetIndex = -1, recenterMap = true } = {}) {
  state.lat = Math.round(lat * 1e4) / 1e4;
  state.lon = Math.round(lon * 1e4) / 1e4;
  $('lat').value = state.lat;
  $('lon').value = state.lon;
  $('preset').value = String(presetIndex);
  picker?.setMarker(state.lat, state.lon, { recenter: recenterMap });
  syncUrl();
  recomputeLocation();
}

function initMap() {
  picker = createMapPicker({
    canvas: $('picker'),
    searchInput: $('place'),
    searchButton: $('place-go'),
    resultsList: $('place-results'),
    statusEl: $('place-status'),
    zoomInButton: $('zoom-in'),
    zoomOutButton: $('zoom-out'),
    tileSource,
    // The picker asks for names in whatever language the page is currently in.
    geocode: (query, view) => geocode(query, view, state.lang),
    t,
    onPick: (lat, lon) => setLocation(lat, lon, { recenterMap: false }),
  });
}

// Reveals the picker and brings it into view. The <details> stays collapsed
// until something asks for it, so no tiles load for visitors who never pick.
function openPicker() {
  const panel = $('map-panel');
  panel.open = true;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  panel.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
}

// Push the selected instant into the timeline widgets. The slider stays
// minute-granular — dragging a second-resolution slider is unusable — so its
// thumb goes to the nearest minute while state keeps the exact second.
function syncTimeUI() {
  $('time').value = String(Math.round(state.secondOfDay / 60));
  $('time-label').textContent = fmtSelected();
}

// Move the whole timeline to one instant, seconds included. Takes the date from
// it too, so an instant that falls on another day in the browser's timezone
// still shows the right sun.
function setInstant(utcMs) {
  const at = new Date(utcMs);
  state.dateStr = `${at.getFullYear()}-${pad2(at.getMonth() + 1)}-${pad2(at.getDate())}`;
  state.secondOfDay = at.getHours() * 3600 + at.getMinutes() * 60 + at.getSeconds();
  $('date').value = state.dateStr;
  syncTimeUI();
  renderAll();
}

function initControls() {
  // The options themselves are built by applyLanguage, which runs before this
  // list is ever selectable.
  const sel = $('preset');
  sel.addEventListener('change', () => {
    const p = PRESETS[Number(sel.value)];
    // The "custom" entry names no place: it is a request to choose one, so open
    // the map rather than leaving the visitor on an unchanged page.
    if (p) setLocation(p.lat, p.lon, { presetIndex: Number(sel.value) });
    else openPicker();
  });

  for (const id of ['lat', 'lon']) {
    $(id).addEventListener('change', () => {
      setLocation(parseFloat($('lat').value), parseFloat($('lon').value));
    });
  }

  $('height').addEventListener('change', () => {
    state.extraHeightM = Math.max(0, parseFloat($('height').value) || 0);
    syncUrl();
    recomputeLocation();
  });

  $('geolocate').addEventListener('click', () => {
    setStatus(t('status.geolocating'));
    navigator.geolocation.getCurrentPosition(
      pos => setLocation(pos.coords.latitude, pos.coords.longitude),
      () => setStatus(t('status.geolocateFailed')),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });

  $('date').addEventListener('change', () => {
    state.dateStr = $('date').value || ECLIPSE_DATE;
    renderAll();
  });

  const time = $('time');
  time.addEventListener('input', () => {
    // Dragging the slider is a fresh choice of minute: it drops any seconds
    // carried in from a contact time.
    state.secondOfDay = Number(time.value) * 60;
    $('time-label').textContent = fmtSelected();
    renderAll();
  });

  // Any clock reading in the verdict jumps the timeline to that instant.
  $('verdict').addEventListener('click', e => {
    const button = e.target.closest('button[data-utc-ms]');
    if (button) setInstant(Number(button.dataset.utcMs));
  });

  $('now').addEventListener('click', () => setInstant(Date.now()));

  $('eclipse-btn').addEventListener('click', () => {
    if (state.eclipse?.visible) {
      setInstant(state.eclipse.max.utcMs);
      return;
    }
    state.dateStr = $('date').value = ECLIPSE_DATE;
    renderAll();
  });

  // Drag to pan the panorama.
  let dragging = null;
  canvas.addEventListener('pointerdown', e => {
    dragging = { x: e.clientX, center: state.viewCenterAz };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if (dragging) {
      const degPerPx = 50 / canvas.getBoundingClientRect().width;
      state.viewCenterAz = Math.min(Math.max(dragging.center - (e.clientX - dragging.x) * degPerPx, AZ_MIN + 25), AZ_MAX - 25);
      renderPanorama();
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const az = state.viewCenterAz - 25 + ((e.clientX - rect.left) / rect.width) * 50;
    const sk = state.terrainSkyline;
    if (!sk) return;
    const limit = obstructionAt(sk, state.nearField, az);
    let ridge = null;
    for (const a of sk.azimuths) {
      if (Math.abs(a.azimuthDeg - az) <= AZ_STEP / 2) { ridge = a.ridgeDistanceM; break; }
    }
    $('readout').textContent = limit === null ? '' :
      t('readout.azimuth', { azimuth: az.toFixed(1), elevation: limit.toFixed(2) }) +
      (ridge ? t('readout.ridge', { km: (ridge / 1000).toFixed(1) }) : '');
  });
  canvas.addEventListener('pointerup', () => { dragging = null; });
}

const shared = parseShareParams(location.search);
state.lang = shared.lang;

initMap();
initLangSwitch();
initControls();
// Before the first render, so a Catalan visitor never sees the Spanish markup.
applyLanguage();
syncTimeUI();
if (shared.lat !== null) {
  state.extraHeightM = shared.extraHeightM;
  $('height').value = String(shared.extraHeightM);
  setLocation(shared.lat, shared.lon);
} else {
  setLocation(PRESETS[0].lat, PRESETS[0].lon, { presetIndex: 0 });
}
