// Page wiring: state, skyline orchestration, canvas rendering, verdict.

import { sunPosition } from './solar.js';
import { localCircumstances } from './eclipse.js';
import { sampleHeight, inCatalonia } from './heights.js';
import {
  computeSkyline, computeNearField, obstructionAt, sunVisible, EYE_HEIGHT_M,
  NEAR_FIELD_DISTANCES_M,
} from './skyline.js';
import { makeGridLoader, makeSurfaceSampler } from './providers.js';
import { destinationPoint } from './geo.js';

const AZ_MIN = 230;
const AZ_MAX = 330;
const AZ_STEP = 0.25;
const NEAR_FIELD_HALF_WEDGE_DEG = 8;
const ECLIPSE_DATE = '2026-08-12';

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

const loadGrid = makeGridLoader(n => setStatus(`Descargando relieve… ${n} teselas`));
const sampleSurface = makeSurfaceSampler();

const state = {
  lat: PRESETS[0].lat,
  lon: PRESETS[0].lon,
  extraHeightM: 0,
  dateStr: ECLIPSE_DATE,
  minuteOfDay: 20 * 60 + 29,
  groundElevM: null,
  eyeElevM: null,
  terrainSkyline: null,
  nearField: null,
  eclipse: null,
  viewCenterAz: 286,
  computeToken: 0,
};

// ---------- time helpers (everything shown in the browser's timezone) ----------

function selectedUtcMs() {
  const [y, m, d] = state.dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 0, state.minuteOfDay).getTime();
}

function fmtTime(ms, withSeconds = false) {
  return new Date(ms).toLocaleTimeString('es-ES', {
    hour: '2-digit', minute: '2-digit', ...(withSeconds ? { second: '2-digit' } : {}),
  });
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

  setStatus('Buscando la elevación del terreno…');
  const ground = await sampleHeight(loadGrid, lat, lon, 0);
  if (token !== state.computeToken) return;
  state.groundElevM = ground ?? 0;
  state.eyeElevM = state.groundElevM + EYE_HEIGHT_M + state.extraHeightM;

  setStatus('Calculando el horizonte de terreno…');
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
  setStatus('Consultando edificios y vegetación (modelo 1 m)…');
  const BATCH = 12;
  for (let i = 0; i < points.length; i += BATCH) {
    if (token !== state.computeToken) return;
    await Promise.all(points.slice(i, i + BATCH).map(p => sampleSurface(p.lat, p.lon)));
    setStatus(`Consultando edificios y vegetación… ${Math.min(i + BATCH, points.length)}/${points.length}`);
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

function visLabel(v) {
  if (v === null) return '—';
  return v ? '<strong class="good">visible</strong>' : '<strong class="bad">oculto</strong>';
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

function renderVerdict() {
  const el = $('verdict');
  const lc = state.eclipse;
  const isEclipseDay = state.dateStr === ECLIPSE_DATE;
  const sunset = effectiveSunsetMs();
  const sunsetLine = sunset
    ? `Ocaso tras el horizonte local: <strong>${fmtTime(sunset)}</strong>.`
    : '';

  if (!isEclipseDay) {
    const s = sunPosition(selectedUtcMs(), state.lat, state.lon);
    const v = state.terrainSkyline
      ? sunVisible(state.terrainSkyline, state.nearField, s.azimuthDeg, s.apparentAltitudeDeg)
      : null;
    el.className = 'panel';
    el.innerHTML = `Sol a las ${fmtTime(selectedUtcMs())}: altura ${s.apparentAltitudeDeg.toFixed(1)}°,
      acimut ${s.azimuthDeg.toFixed(1)}° — ${visLabel(v)}. ${sunsetLine}`;
    return;
  }

  if (!lc?.visible) {
    el.className = 'panel bad';
    el.textContent = 'El eclipse del 12 de agosto de 2026 no es visible desde este punto.';
    return;
  }

  const rows = [
    ['C1 — primer contacto', lc.c1],
    ['C2 — inicio totalidad', lc.c2],
    ['Máximo', lc.max],
    ['C3 — fin totalidad', lc.c3],
    ['C4 — último contacto', lc.c4],
  ].filter(([, e]) => e).map(([label, e]) => {
    const v = visibilityOf(e);
    return `<tr><th>${label}</th><td>${fmtTime(e.utcMs, true)}</td>
      <td>${e.apparentAltitudeDeg.toFixed(1)}°</td><td>${visLabel(v)}</td></tr>`;
  }).join('');

  let headline;
  if (lc.isTotal) {
    const v2 = visibilityOf(lc.c2);
    const v3 = visibilityOf(lc.c3);
    const dur = Math.round(lc.totalityDurationS);
    if (v2 && v3) {
      el.className = 'panel good';
      headline = `<strong class="good">ECLIPSE TOTAL VISIBLE</strong> desde aquí —
        totalidad de ${dur} s por encima del horizonte local.`;
    } else if (v2 || v3) {
      el.className = 'panel bad';
      headline = `<strong class="bad">Totalidad solo parcialmente visible</strong>:
        el relieve oculta parte de los ${dur} s de totalidad.`;
    } else {
      el.className = 'panel bad';
      headline = `<strong class="bad">Totalidad OCULTA tras el relieve</strong>
        (duraría ${dur} s con horizonte despejado).`;
    }
  } else {
    el.className = 'panel';
    const v = visibilityOf(lc.max);
    headline = `Aquí el eclipse será <strong>parcial</strong> (magnitud
      ${(lc.magnitude * 100).toFixed(1)}%): la franja de totalidad queda fuera de este punto.
      Máximo a las ${fmtTime(lc.max.utcMs, true)}, ${visLabel(v)}.`;
  }

  const nfNote = state.nearField
    ? ''
    : (inCatalonia(state.lat, state.lon)
      ? '<p class="note">Edificios aún no consultados…</p>'
      : '<p class="note">Fuera de Cataluña: solo relieve del terreno, sin edificios.</p>');

  el.innerHTML = `${headline}<table><tr><th></th><th>Hora</th><th>Altura</th><th></th></tr>${rows}</table>
    <p class="note">${sunsetLine}</p>${nfNote}`;
}

// ---------- panorama rendering ----------

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

  // The sun at the selected instant (drawn before terrain so ridges hide it).
  const sunX = xOf(sunSel.azimuthDeg);
  const sunY = yOf(sunSel.apparentAltitudeDeg);
  const rx = (sunSel.semiDiameterDeg / span) * W;
  const ry = (sunSel.semiDiameterDeg / (yMax - yMin)) * H;
  if (sunSel.azimuthDeg >= azLeft && sunSel.azimuthDeg <= azRight) {
    const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, ry * 6);
    glow.addColorStop(0, 'rgba(255,235,170,0.55)');
    glow.addColorStop(1, 'rgba(255,235,170,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(sunX, sunY, rx * 6, ry * 6, 0, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#fff3c0';
    ctx.beginPath();
    ctx.ellipse(sunX, sunY, rx, ry, 0, 0, 7);
    ctx.fill();
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
}

// ---------- controls ----------

function setLocation(lat, lon, presetIndex = -1) {
  state.lat = Math.round(lat * 1e4) / 1e4;
  state.lon = Math.round(lon * 1e4) / 1e4;
  $('lat').value = state.lat;
  $('lon').value = state.lon;
  $('preset').value = String(presetIndex);
  recomputeLocation();
}

function initControls() {
  const sel = $('preset');
  sel.innerHTML = '<option value="-1">— personalizado —</option>' +
    PRESETS.map((p, i) => `<option value="${i}">${p.name}</option>`).join('');
  sel.addEventListener('change', () => {
    const p = PRESETS[Number(sel.value)];
    if (p) setLocation(p.lat, p.lon, Number(sel.value));
  });

  for (const id of ['lat', 'lon']) {
    $(id).addEventListener('change', () => {
      setLocation(parseFloat($('lat').value), parseFloat($('lon').value));
    });
  }

  $('height').addEventListener('change', () => {
    state.extraHeightM = Math.max(0, parseFloat($('height').value) || 0);
    recomputeLocation();
  });

  $('geolocate').addEventListener('click', () => {
    setStatus('Pidiendo tu ubicación…');
    navigator.geolocation.getCurrentPosition(
      pos => setLocation(pos.coords.latitude, pos.coords.longitude),
      () => setStatus('No se pudo obtener la ubicación.'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });

  $('date').addEventListener('change', () => {
    state.dateStr = $('date').value || ECLIPSE_DATE;
    renderAll();
  });

  const time = $('time');
  time.value = String(state.minuteOfDay);
  time.addEventListener('input', () => {
    state.minuteOfDay = Number(time.value);
    $('time-label').textContent =
      `${String(Math.floor(state.minuteOfDay / 60)).padStart(2, '0')}:${String(state.minuteOfDay % 60).padStart(2, '0')}`;
    renderAll();
  });

  $('now').addEventListener('click', () => {
    const now = new Date();
    $('date').value = state.dateStr =
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    time.value = String(now.getHours() * 60 + now.getMinutes());
    time.dispatchEvent(new Event('input'));
  });

  $('eclipse-btn').addEventListener('click', () => {
    $('date').value = state.dateStr = ECLIPSE_DATE;
    if (state.eclipse?.visible) {
      const local = new Date(state.eclipse.max.utcMs);
      time.value = String(local.getHours() * 60 + local.getMinutes());
    }
    time.dispatchEvent(new Event('input'));
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
      `Acimut ${az.toFixed(1)}° — horizonte a ${limit.toFixed(2)}°` +
      (ridge ? ` (cresta a ${(ridge / 1000).toFixed(1)} km)` : '');
  });
  canvas.addEventListener('pointerup', () => { dragging = null; });

  $('tz-note').textContent =
    `Todas las horas en tu zona horaria: ${Intl.DateTimeFormat().resolvedOptions().timeZone}.`;
}

initControls();
$('time').dispatchEvent(new Event('input'));
setLocation(PRESETS[0].lat, PRESETS[0].lon, 0);
