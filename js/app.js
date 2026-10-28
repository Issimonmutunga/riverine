// Flood Depth UI: map, area selection, worker orchestration, exposure and exports.
import * as G from './geo.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const PRESETS = [
  { name: 'Budalangi floodplain, Nzoia River — Kenya', b: [33.95, 0.02, 34.22, 0.22], stage: 2, water: 1134.3 },
  { name: 'Tana River at Garissa — Kenya', b: [39.56, -0.56, 39.75, -0.36], stage: 3 },
  { name: 'Nairobi & Ngong rivers — Kenya', b: [36.76, -1.34, 36.95, -1.22], stage: 2 },
  { name: 'Buzi town (Cyclone Idai, 2019) — Mozambique', b: [34.52, -19.97, 34.72, -19.80], stage: 4 },
  { name: 'Niger River at Niamey — Niger', b: [2.02, 13.44, 2.22, 13.60], stage: 2.5 },
  { name: 'Wadi Derna (Storm Daniel, 2023) — Libya', b: [22.52, 32.66, 22.70, 32.78], stage: 4 },
  { name: 'Ahr valley (July 2021 flood) — Germany', b: [6.95, 50.48, 7.16, 50.58], stage: 5 },
];

// ---------------- Map ----------------
const map = L.map('map', { zoomControl: false, preferCanvas: true }).setView([0.3, 36.5], 6);
L.control.zoom({ position: 'bottomright' }).addTo(map);
const ACCENT = '#0071e3';
const bases = {
  'OpenStreetMap': L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }),
  'OpenTopoMap': L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17, attribution: '© OpenStreetMap contributors, SRTM · style © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
  }),
  'Sentinel-2 cloudless 2016': L.tileLayer('https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg', {
    maxZoom: 17, attribution: '<a href="https://s2maps.eu">Sentinel-2 cloudless</a> by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016, CC BY 4.0)',
  }),
};
bases['OpenStreetMap'].addTo(map);
L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
$$('input[name=basemap]').forEach((r) => r.addEventListener('change', () => {
  for (const [k, layer] of Object.entries(bases)) {
    if (k === r.value) layer.addTo(map); else layer.remove();
  }
}));

// Layers popover
const layersBtn = $('#btnLayers'), layersPop = $('#layersPop');
function toggleLayers(open = layersPop.hidden) {
  layersPop.hidden = !open;
  layersBtn.setAttribute('aria-expanded', open);
}
layersBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleLayers(); });
document.addEventListener('click', (e) => { if (!layersPop.hidden && !e.target.closest('.mapctl')) toggleLayers(false); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { toggleLayers(false); $('#searchResults').hidden = true; } });
L.DomEvent.disableClickPropagation($('.mapctl'));
L.DomEvent.disableScrollPropagation(layersPop);

// Phone bottom sheet
$('#btnSheet').addEventListener('click', () => $('#panel').classList.toggle('collapsed'));
map.attributionControl.addAttribution('Elevation: <a href="https://registry.opendata.aws/terrain-tiles/">AWS Terrain Tiles</a>');

// Rasters live in their own pane beneath vectors so streams and markers stay visible and clickable.
map.createPane('rasters');
map.getPane('rasters').style.zIndex = 350;
map.getPane('rasters').style.pointerEvents = 'none';

// Free public Overpass instances, tried in order; any one may be busy or rate-limiting.
const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

async function overpass(query, timeoutMs, onTry) {
  const errors = [];
  for (const url of OVERPASS) {
    const host = new URL(url).host;
    onTry?.(host);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: query }), signal: ctl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      errors.push(`${host}: ${err.name === 'AbortError' ? 'timed out' : err.message}`);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`All Overpass servers failed (${errors.join('; ')})`);
}
const vecRenderer = L.canvas({ padding: 0.3, tolerance: 6 });

// ---------------- State ----------------
const state = {
  aoi: null, aoiRect: null,
  upload: null,
  analysis: null,
  scenario: null,
  exposure: null,
  layers: { hill: null, hand: null, depth: null, prob: null, streams: null, exposure: null },
};

// ---------------- Worker RPC ----------------
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
let rpcId = 0;
const pending = new Map();
worker.onmessage = (ev) => {
  const m = ev.data;
  if (m.type === 'progress') return setProgress(m.msg, m.pct);
  const p = pending.get(m.id);
  if (!p) return;
  pending.delete(m.id);
  if (m.type === 'error') p.reject(new Error(m.message));
  else p.resolve(m);
};
worker.onerror = (e) => toast(`Worker error: ${e.message}`, true);
function call(msg, transfer = []) {
  const id = ++rpcId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ ...msg, id }, transfer);
  });
}

// ---------------- UI helpers ----------------
let toastTimer;
function toast(msg, error = false, ms = 4500) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('error', error);
  t.hidden = false;
  clearTimeout(toastTimer);
  if (ms) toastTimer = setTimeout(() => (t.hidden = true), ms);
}
function setProgress(msg, pct) {
  const p = $('#progress');
  p.hidden = false;
  p.querySelector('.bar').style.setProperty('--p', `${pct}%`);
  p.querySelector('.msg').textContent = msg;
}
function stats(el, items) {
  el.hidden = false;
  el.innerHTML = items.map(([k, v, wide]) => `<div class="${wide ? 'wide' : ''}"><dt>${k}</dt><dd>${v}</dd></div>`).join('');
}
const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d }) : '—');
const fmtInt = (v) => Math.round(v).toLocaleString();
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function download(name, data, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

// ---------------- Place search (Nominatim; on submit only, per its usage policy) ----------------
const results = $('#searchResults');
$('#searchForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('#searchInput').value.trim();
  if (!q) return;
  results.hidden = false;
  results.innerHTML = '<li class="empty">Searching…</li>';
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { 'Accept-Language': navigator.language || 'en' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const hits = await res.json();
    if (!hits.length) { results.innerHTML = '<li class="empty">No places found</li>'; return; }
    results.innerHTML = '';
    for (const h of hits) {
      const [name, ...rest] = h.display_name.split(', ');
      const li = document.createElement('li');
      li.innerHTML = `<svg><use href="#i-pin"/></svg><div><b>${esc(name)}</b><small>${esc(rest.join(', '))}</small></div>`;
      li.addEventListener('click', () => pickPlace(h, name));
      results.append(li);
    }
  } catch (err) {
    results.innerHTML = `<li class="empty">Search unavailable (${esc(err.message)})</li>`;
  }
});
$('#searchInput').addEventListener('input', (e) => { if (!e.target.value) results.hidden = true; });
document.addEventListener('click', (e) => { if (!e.target.closest('#searchForm')) results.hidden = true; });

function pickPlace(h, name) {
  results.hidden = true;
  $('#searchInput').value = name;
  setDemSource('global');
  const [s, n, w, ee] = h.boundingbox.map(Number);
  const lat = +h.lat, lon = +h.lon;
  // Use the place's own extent when it is a sensible analysis size, else a ~16 km box around it.
  const kmW = (ee - w) * 111.32 * Math.cos(lat * Math.PI / 180), kmH = (n - s) * 110.57;
  const b = kmW > 3 && kmH > 3 && kmW < 40 && kmH < 40
    ? L.latLngBounds([s, w], [n, ee])
    : L.latLngBounds([lat - 0.072, lon - 0.072 / Math.cos(lat * Math.PI / 180)], [lat + 0.072, lon + 0.072 / Math.cos(lat * Math.PI / 180)]);
  setAOI(b);
  map.fitBounds(b, { padding: [40, 40] });
}

// ---------------- Steps ----------------
function unlock(...ids) { ids.forEach((id) => $(id).classList.remove('locked')); }

// ---------------- Area selection ----------------
for (const [i, p] of PRESETS.entries()) $('#preset').append(new Option(p.name, i));
$('#preset').addEventListener('change', (e) => {
  const p = PRESETS[e.target.value];
  if (!p) return;
  setDemSource('global');
  const [w, s, ee, n] = p.b;
  setAOI(L.latLngBounds([s, w], [n, ee]));
  map.fitBounds(state.aoi, { padding: [20, 20] });
  $('#waterLevel').value = p.water ?? 0;
  $('#stage').value = p.stage;
  $('#stageOut').textContent = `${(+p.stage).toFixed(1)} m`;
});

function setAOI(bounds) {
  state.aoi = bounds;
  if (state.aoiRect) state.aoiRect.remove();
  state.aoiRect = L.rectangle(bounds, { color: ACCENT, weight: 2, dashArray: '6 6', fillColor: ACCENT, fillOpacity: 0.04, interactive: false }).addTo(map);
  describeAOI();
}

function describeAOI() {
  const b = state.aoi;
  if (!b) return;
  const latc = b.getCenter().lat;
  const wkm = (b.getEast() - b.getWest()) * 111.32 * Math.cos(latc * Math.PI / 180);
  const hkm = (b.getNorth() - b.getSouth()) * 110.57;
  let msg = `${fmt(wkm)} × ${fmt(hkm)} km`;
  if (!state.upload) {
    const z = +$('#detail').value;
    const cells = (G.lonToPx(b.getEast(), z) - G.lonToPx(b.getWest(), z)) * (G.latToPx(b.getSouth(), z) - G.latToPx(b.getNorth(), z));
    const cellM = G.mercRes(z) * Math.cos(latc * Math.PI / 180);
    msg += ` · ≈${fmtInt(cells / 1e3)}k cells at ${fmt(cellM, 0)} m`;
    if (cells > 2.2e6) msg += ' (resolution will be reduced to fit)';
    if (wkm * hkm > 40000) msg = `${msg}. This area is very large; consider a smaller one.`;
  } else {
    msg = `${state.upload.name}: ${msg}`;
  }
  $('#aoiInfo').textContent = msg;
  $('#btnRun').disabled = false;
}
$('#detail').addEventListener('change', describeAOI);

$('#btnView').addEventListener('click', () => {
  setDemSource('global');
  setAOI(map.getBounds().pad(-0.05));
});

let drawing = null, lastDraw = 0;
$('#btnDraw').addEventListener('click', () => {
  setDemSource('global');
  const btn = $('#btnDraw');
  if (drawing) return stopDraw();
  drawing = { start: null, rect: null };
  btn.classList.add('active');
  btn.querySelector('span').textContent = 'Drag on map…';
  if (innerWidth <= 820) $('#panel').classList.add('collapsed');
  map.dragging.disable();
  map.getContainer().classList.add('aoi-drawing');
  toast('Click and drag on the map to draw the analysis area.', false, 3500);
});
function stopDraw() {
  if (drawing?.rect) drawing.rect.remove();
  drawing = null;
  map.dragging.enable();
  map.getContainer().classList.remove('aoi-drawing');
  const btn = $('#btnDraw');
  btn.classList.remove('active');
  btn.querySelector('span').textContent = 'Draw on map';
}
map.on('mousedown', (e) => {
  if (!drawing) return;
  drawing.start = e.latlng;
  drawing.rect = L.rectangle(L.latLngBounds(e.latlng, e.latlng), { color: ACCENT, weight: 2, fillOpacity: 0.08, interactive: false }).addTo(map);
});
map.on('mousemove', (e) => {
  if (drawing?.start) drawing.rect.setBounds(L.latLngBounds(drawing.start, e.latlng));
});
map.on('mouseup', (e) => {
  if (!drawing?.start) return;
  const b = L.latLngBounds(drawing.start, e.latlng);
  stopDraw();
  lastDraw = Date.now();
  $('#panel').classList.remove('collapsed');
  if (map.latLngToContainerPoint(b.getNorthWest()).distanceTo(map.latLngToContainerPoint(b.getSouthEast())) < 12) return;
  setAOI(b);
});

// ---------------- DEM source / upload ----------------
function setDemSource(v) {
  $(`input[name=dem][value=${v}]`).checked = true;
  $('#uploadBox').hidden = v !== 'upload';
  $('#detailField').style.opacity = v === 'upload' ? 0.45 : 1;
  $('#detail').disabled = v === 'upload';
  if (v === 'global' && state.upload) { state.upload = null; $('#fileDem').value = ''; describeAOI(); }
}
$$('input[name=dem]').forEach((r) => r.addEventListener('change', () => setDemSource(r.value)));

$('#fileDem').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    toast(`Reading ${file.name}…`, false, 0);
    const GeoTIFF = await import('https://cdn.jsdelivr.net/npm/geotiff@2.1.3/+esm');
    const tiff = await GeoTIFF.fromArrayBuffer(await file.arrayBuffer());
    const img = await tiff.getImage();
    const width = img.getWidth(), height = img.getHeight();
    if (width * height > 80e6) throw new Error('DEM is larger than 80 million pixels — clip it first.');
    const keys = img.getGeoKeys() || {};
    const epsg = keys.ProjectedCSTypeGeoKey || keys.GeographicTypeGeoKey;
    const T = G.crsTransforms(epsg);
    if (!T) throw new Error(`Unsupported CRS (EPSG:${epsg ?? 'unknown'}). Reproject to EPSG:4326 or WGS84 UTM.`);
    const [band] = await img.readRasters({ samples: [0] });
    const data = band instanceof Float32Array ? band : Float32Array.from(band);
    const bbox = img.getBoundingBox();
    const nd = img.getGDALNoData();
    state.upload = { name: file.name, data, width, height, bbox, epsg, nodata: nd ?? -32768 };
    const corners = [[bbox[0], bbox[1]], [bbox[2], bbox[3]], [bbox[0], bbox[3]], [bbox[2], bbox[1]]].map(([x, y]) => T.inv(x, y));
    const b = L.latLngBounds(corners);
    setAOI(b);
    map.fitBounds(b, { padding: [20, 20] });
    toast(`Loaded ${file.name} · ${width}×${height} px · ${T.name}`);
  } catch (err) {
    state.upload = null;
    toast(err.message, true, 8000);
  }
});

// ---------------- Terrain analysis ----------------
$('#btnRun').addEventListener('click', runAnalysis);

async function runAnalysis() {
  if (!state.aoi) return;
  const btn = $('#btnRun');
  btn.disabled = true;
  btn.textContent = 'Analyzing…';
  setProgress('Starting', 2);
  clearResults();
  const b = state.aoi;
  const msg = {
    type: 'analyze',
    source: state.upload ? 'upload' : 'terrarium',
    bbox: { w: b.getWest(), s: Math.max(b.getSouth(), -84), e: b.getEast(), n: Math.min(b.getNorth(), 84) },
    zmax: +$('#detail').value,
    threshKm2: Math.max(0.01, +$('#thresh').value || 1),
    maskSea: $('#maskSea').checked,
    waterLevel: +$('#waterLevel').value || 0,
  };
  if ($('#burn').checked) {
    setProgress('Fetching mapped rivers from OpenStreetMap', 3);
    msg.rivers = await fetchRivers(msg.bbox);
  }
  if (state.upload) {
    const u = state.upload;
    msg.upload = { data: u.data.slice(), width: u.width, height: u.height, bbox: u.bbox, epsg: u.epsg, nodata: u.nodata };
  }
  try {
    const res = await call(msg, msg.upload ? [msg.upload.data.buffer] : []);
    state.analysis = res;
    await showTerrain(res);
    unlock('#stepScenario', '#stepExposure', '#stepLayers');
    $('#stepArea').classList.add('done');
    setProgress(`Done in ${fmt(res.stats.seconds)} s`, 100);
    setTimeout(() => ($('#progress').hidden = true), 1800);
    await runScenario();
    $('#stepScenario').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    setProgress(err.message, 0);
    toast(err.message, true, 8000);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Analyze terrain';
  }
}

async function fetchRivers(b) {
  const q = `[out:json][timeout:25];way["waterway"~"^(river|canal)$"](${b.s},${b.w},${b.n},${b.e});out geom;`;
  try {
    const json = await overpass(q, 30000, (host) => setProgress(`Fetching mapped rivers (${host})`, 3));
    return json.elements.filter((e) => e.geometry).map((e) => e.geometry.map((p) => [p.lat, p.lon]));
  } catch (err) {
    toast(`River lines unavailable. Continuing with the DEM alone. ${err.message}`, true, 8000);
    return [];
  }
}

function clearResults() {
  for (const k of Object.keys(state.layers)) { state.layers[k]?.remove(); state.layers[k] = null; }
  state.analysis = state.scenario = state.exposure = null;
  $('#terrainStats').hidden = $('#floodStats').hidden = $('#exposureStats').hidden = $('#terrainMore').hidden = true;
  $('#floodWarn').hidden = true;
  $('#facilityList').innerHTML = '';
  $('#legend').hidden = true;
}

function rgbaToURL(rgba, W, H) {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer), W, H), 0, 0);
  return new Promise((r) => cv.toBlob((b) => r(URL.createObjectURL(b)), 'image/png'));
}
function gridBounds(g) { return L.latLngBounds([g.bounds.s, g.bounds.w], [g.bounds.n, g.bounds.e]); }

// Keep popups in proportion to the analysis area: full size when it fills the view,
// smaller for each zoom level out, and closed once the area is a speck.
function scalePopups() {
  const g = state.analysis?.grid;
  const dz = g ? map.getBoundsZoom(gridBounds(g)) - map.getZoom() : 0;
  if (dz >= 4) map.closePopup();
  const scale = dz <= 0 ? 1 : Math.max(0.7, 1 - 0.1 * dz);
  map.getContainer().style.setProperty('--pop-scale', scale);
  map.eachLayer((l) => l instanceof L.Popup && l.update());
}
map.on('zoomend popupopen', scalePopups);

async function setOverlay(key, rgba, zIndex) {
  const g = state.analysis.grid;
  const url = await rgbaToURL(rgba, g.W, g.H);
  const old = state.layers[key];
  const layer = L.imageOverlay(url, gridBounds(g), {
    opacity: key === 'hill' ? 0.55 : +$('#opacity').value, className: 'px', zIndex, interactive: false, pane: 'rasters',
  });
  state.layers[key] = layer;
  if (old) { URL.revokeObjectURL(old._url); old.remove(); }
  syncLayers();
}

async function showTerrain(res) {
  const g = res.grid, s = res.stats;
  stats($('#terrainStats'), [
    ['Grid', `${fmtInt(g.W)} × ${fmtInt(g.H)}`],
    ['Cell size', `${fmt(g.cellM, 0)} m`],
    ['Elevation', `${fmtInt(s.zmin)}–${fmtInt(s.zmax)} m`],
    ['Stream reaches', fmtInt(s.reaches)],
    ['Channel length', `${fmtInt(s.streamKm)} km`],
    ['Compute time', `${fmt(s.seconds)} s`],
    ['Rivers burned (OSM)', s.rivers ? `${fmtInt(s.rivers)} lines · ${fmtInt(s.burnedCells)} cells` : 'none', true],
    ['Source', esc(s.source), true],
  ]);
  $('#terrainMore').hidden = false;
  await setOverlay('hill', res.hill, 210);
  await setOverlay('hand', res.handImg, 220);
  buildStreams(res);
  map.fitBounds(gridBounds(g), { padding: [10, 10] });
}

function buildStreams(res) {
  const maxA = Math.max(...res.reaches.map((r) => r.areaKm2));
  const group = L.layerGroup();
  for (const r of res.reaches) {
    const w = 1 + 3.5 * Math.log1p(r.areaKm2) / Math.log1p(maxA);
    const line = L.polyline(r.line, { renderer: vecRenderer, color: '#0b3d91', weight: w, opacity: 0.9, bubblingMouseEvents: false });
    line.on('click', (e) => L.popup({ maxWidth: 280 }).setLatLng(e.latlng).setContent(reachPopup(r)).openOn(map));
    r.layer = line;
    group.addLayer(line);
  }
  state.layers.streams = group;
  syncLayers();
}

// ---------------- Scenario ----------------
let mode = 'stage';
$$('#modeTabs button').forEach((b) => b.addEventListener('click', () => {
  mode = b.dataset.mode;
  $$('#modeTabs button').forEach((x) => x.setAttribute('aria-selected', x === b));
  $$('.mode').forEach((m) => (m.hidden = m.dataset.mode !== mode));
  runScenario();
}));

function scenarioParams() {
  return {
    stage: +$('#stage').value,
    P24: +$('#p24').value || 0,
    C: +$('#runoffC').value,
    Cf: +$('#cf').value,
    Qref: +$('#qref').value || 0,
    b: +$('#qexp').value || 0.7,
    n: +$('#manning').value,
    sigma: +$('#sigma').value,
    danger: dangerDepth(),
  };
}

// ---------------- Danger depth ----------------
const dangerDepth = () => ($('#dangerOn').checked ? +$('#danger').value : Infinity);

function severity(depth) {
  const danger = dangerDepth();
  if (!(depth > 0)) return { label: 'Dry', color: '#8e8e93' };
  if (depth >= danger) return { label: 'Dangerous', color: '#e0301e' };
  if (depth < 0.5) return { label: 'Shallow', color: '#4292c6' };
  return { label: 'Moderate', color: '#1f5fa8' };
}

const depthText = (d) => (!(d > 0) ? '0 m' : d < 0.01 ? '< 0.01 m' : `${fmt(d, 2)} m`);

function showDangerReadout(km2) {
  const d = dangerDepth();
  $('#dangerCard').classList.toggle('off', !Number.isFinite(d));
  $('#dangerReadout').innerHTML = Number.isFinite(d) && km2 != null
    ? `<b>${fmt(km2, 2)} km²</b> deeper than ${fmt(d, 1)} m, shown in red`
    : '';
}

async function restyle() {
  if (!state.scenario) return;
  try {
    const res = await call({ type: 'restyle', danger: dangerDepth() });
    state.scenario.stats.deepKm2 = res.deepKm2;
    showDangerReadout(res.deepKm2);
    await setOverlay('depth', res.depthImg, 230);
  } catch (err) { toast(err.message, true); }
}
const restyleSoon = debounce(restyle, 60);
$('#danger').addEventListener('input', (e) => { $('#dangerOut').textContent = `${(+e.target.value).toFixed(1)} m`; restyleSoon(); });
$('#dangerOn').addEventListener('change', () => { showDangerReadout(state.scenario?.stats.deepKm2); restyle(); });

let scenarioBusy = false, scenarioQueued = false;
async function runScenario() {
  if (!state.analysis) return;
  if (scenarioBusy) { scenarioQueued = true; return; }
  scenarioBusy = true;
  try {
    const params = scenarioParams();
    const res = await call({ type: 'scenario', mode, params });
    state.scenario = { ...res, params, mode };
    const s = res.stats;
    const items = [
      ['Flooded area', `${fmt(s.floodedKm2, 2)} km²`],
      ['Max depth', `${fmt(s.maxDepth, 1)} m`],
      ['Plausible area (P ≥ 10%)', `${fmt(s.plausibleKm2, 2)} km²`],
      ['Mean depth', `${fmt(s.meanDepth, 2)} m`],
    ];
    if (mode !== 'stage') {
      const big = state.analysis.reaches.reduce((a, r, i) => (r.areaKm2 > a.areaKm2 ? { ...r, i } : a), { areaKm2: 0 });
      items.push(['Main-river discharge', `${fmtInt(res.qR[big.i])} m³/s`], ['Main-river stage', `${fmt(res.hR[big.i], 2)} m`]);
    }
    stats($('#floodStats'), items);
    const warns = [];
    if (s.capped) warns.push(`${s.capped} reach(es) exceed the 20 m rating-curve range, so their stage is capped.`);
    if (mode === 'rain') {
      const large = state.analysis.reaches.filter((r) => r.areaKm2 > 50).length;
      if (large) warns.push(`${large} reach(es) drain > 50 km². The Rational method tends to over-estimate there, so treat those results as an upper bound.`);
    }
    $('#floodWarn').hidden = !warns.length;
    $('#floodWarn').textContent = warns.join(' ');
    showDangerReadout(s.deepKm2);
    await Promise.all([setOverlay('depth', res.depthImg, 230), setOverlay('prob', res.probImg, 230)]);
    if (state.exposure) await sampleExposure();
  } catch (err) {
    toast(err.message, true);
  } finally {
    scenarioBusy = false;
    if (scenarioQueued) { scenarioQueued = false; runScenario(); }
  }
}
const runScenarioSoon = debounce(runScenario, 120);

$('#stage').addEventListener('input', (e) => { $('#stageOut').textContent = `${(+e.target.value).toFixed(1)} m`; runScenarioSoon(); });
$('#sigma').addEventListener('input', (e) => { $('#sigmaOut').textContent = `${(+e.target.value).toFixed(1)} m`; runScenarioSoon(); });
['#p24', '#cf', '#runoffC', '#qref', '#qexp', '#manning'].forEach((s) => $(s).addEventListener('change', runScenario));

function reachPopup(r) {
  const n = state.scenario?.params.n ?? +$('#manning').value;
  const stages = state.analysis.stages;
  const Q = r.Q.map((q) => q / n);
  const h = state.scenario?.hR[r.id] ?? 0;
  const q = state.scenario?.qR[r.id] ?? 0;
  // plot up to max(2h, 6 m)
  const hTop = Math.min(stages[stages.length - 1], Math.max(6, h * 2));
  const k = stages.findIndex((s) => s >= hTop);
  const qs = Q.slice(0, k + 1), hs = stages.slice(0, k + 1);
  const qMax = Math.max(qs[qs.length - 1], q, 1);
  const Wd = 240, Ht = 120, pl = 34, pb = 20;
  const x = (v) => pl + (v / qMax) * (Wd - pl - 6);
  const y = (v) => Ht - pb - (v / hTop) * (Ht - pb - 6);
  const path = qs.map((v, i) => `${i ? 'L' : 'M'}${x(v).toFixed(1)},${y(hs[i]).toFixed(1)}`).join('');
  return `<div class="pop">
    <h4>Reach ${r.id + 1}</h4>
    <table>
      <tr><td>Catchment area</td><td>${fmt(r.areaKm2, 2)} km²</td></tr>
      <tr><td>Reach length · slope</td><td>${fmt(r.lenM / 1000, 2)} km · ${(r.slope * 100).toFixed(2)}%</td></tr>
      <tr><td>Channel elevation</td><td>${fmtInt(r.zOut)} m</td></tr>
      <tr><td>Scenario stage</td><td>${fmt(h, 2)} m</td></tr>
      <tr><td>Scenario discharge</td><td>${fmt(q, q < 10 ? 2 : 0)} m³/s</td></tr>
    </table>
    <svg width="${Wd}" height="${Ht}" role="img" aria-label="Synthetic rating curve">
      <line class="axis" x1="${pl}" y1="${Ht - pb}" x2="${Wd - 4}" y2="${Ht - pb}"/>
      <line class="axis" x1="${pl}" y1="4" x2="${pl}" y2="${Ht - pb}"/>
      <path class="curve" d="${path}"/>
      ${h > 0 ? `<circle class="now" cx="${x(q)}" cy="${y(h)}" r="4"/>` : ''}
      <text x="${pl - 4}" y="10" text-anchor="end">${fmt(hTop, 0)} m</text>
      <text x="${pl - 4}" y="${Ht - pb}" text-anchor="end">0</text>
      <text x="${Wd - 4}" y="${Ht - 6}" text-anchor="end">${fmtInt(qMax)} m³/s</text>
      <text x="${pl + 4}" y="${Ht - 6}">Synthetic rating curve</text>
    </svg></div>`;
}

// Click anywhere for a point readout
map.on('click', async (e) => {
  if (!state.analysis || drawing || Date.now() - lastDraw < 400) return;
  try {
    const { values: [v] } = await call({ type: 'sample', points: [[e.latlng.lat, e.latlng.lng]] });
    if (!v) return;
    hideTip();
    const sev = severity(v.depth);
    const rows = [
      ['Chance of flooding', `${Math.round(v.prob * 100)}%`],
      ['Ground elevation', v.elev != null ? `${fmt(v.elev, 1)} m` : '—'],
      ['Height above river', v.hand != null ? `${fmt(v.hand, 2)} m` : 'not drained to a channel'],
      ['River stage here', v.stage != null ? `${fmt(v.stage, 2)} m` : '—'],
      ['Reach', v.reach >= 0 ? v.reach + 1 : '—'],
    ];
    L.popup({ maxWidth: 260 }).setLatLng(e.latlng).setContent(`<div class="pop">
      <div class="hero"><strong>${depthText(v.depth)}</strong><span class="badge" style="background:${sev.color}">${sev.label}</span></div>
      <table>${rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</table></div>`).openOn(map);
  } catch { /* ignore */ }
});

// Hover readout: depth under the cursor, one worker request in flight at a time.
const tip = Object.assign(document.createElement('div'), { className: 'hovertip', hidden: true });
$('#app').append(tip);
let hoverBusy = false, hoverNext = null, hoverGen = 0;
// Bumping the generation drops any sample still in flight, so a stale readout can't reappear.
const hideTip = () => { tip.hidden = true; hoverNext = null; hoverGen++; };
async function hoverAt(e) {
  if (hoverBusy) { hoverNext = e; return; }
  hoverBusy = true;
  const gen = hoverGen;
  try {
    const { values: [v] } = await call({ type: 'sample', points: [[e.latlng.lat, e.latlng.lng]] });
    if (gen !== hoverGen) return;
    if (!v || (!(v.depth > 0) && v.prob < 0.05) || drawing) { hideTip(); return; }
    const sev = severity(v.depth);
    tip.innerHTML = `<i class="dot" style="background:${sev.color}"></i><b>${v.depth > 0 ? `${depthText(v.depth)} deep` : 'Dry here'}</b><span>${sev.label} · ${Math.round(v.prob * 100)}% chance</span>`;
    tip.style.left = `${e.containerPoint.x}px`;
    tip.style.top = `${e.containerPoint.y}px`;
    tip.hidden = false;
  } catch { hideTip(); } finally {
    hoverBusy = false;
    if (hoverNext) { const n = hoverNext; hoverNext = null; hoverAt(n); }
  }
}
if (matchMedia('(hover: hover)').matches) {
  let popupOpen = false;
  map.on('popupopen', () => (popupOpen = true)).on('popupclose', () => (popupOpen = false));
  map.on('mousemove', (e) => {
    if (e.originalEvent?.target.closest?.('.leaflet-popup')) return hideTip();
    if (state.scenario && !drawing && !popupOpen) hoverAt(e);
  });
  map.on('mouseout dragstart zoomstart popupopen', hideTip);
}

// ---------------- Exposure (OpenStreetMap) ----------------
const FACILITY = /^(hospital|clinic|doctors|health_post|pharmacy|school|college|university|kindergarten|police|fire_station|shelter|townhall|community_centre|marketplace|water_point|drinking_water)$/;

$('#btnExposure').addEventListener('click', async () => {
  const g = state.analysis.grid.bounds;
  const btn = $('#btnExposure');
  btn.disabled = true; btn.textContent = 'Querying OpenStreetMap…';
  const bb = `${g.s},${g.w},${g.n},${g.e}`;
  const am = 'hospital|clinic|doctors|health_post|pharmacy|school|college|university|kindergarten|police|fire_station|shelter|townhall|community_centre|marketplace|water_point|drinking_water';
  const q = `[out:json][timeout:120];(way["building"](${bb});node["amenity"~"^(${am})$"](${bb});way["amenity"~"^(${am})$"](${bb}););out tags center 80000;`;
  try {
    const json = await overpass(q, 120000, (host) => { btn.textContent = `Querying OpenStreetMap (${host})…`; });
    const feats = [];
    const seen = new Set();
    for (const el of json.elements) {
      const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
      if (lat == null || seen.has(`${el.type}${el.id}`)) continue;
      seen.add(`${el.type}${el.id}`);
      const t = el.tags || {};
      const fac = t.amenity && FACILITY.test(t.amenity);
      feats.push({ id: `${el.type}/${el.id}`, lat, lon, kind: fac ? t.amenity : 'building', name: t.name || '', facility: !!fac });
    }
    state.exposure = { feats, truncated: json.elements.length >= 80000 };
    await sampleExposure();
    if (!feats.length) toast('No buildings are mapped in OpenStreetMap here yet. You can help at tasks.hotosm.org.', false, 8000);
  } catch (err) {
    toast(err.message, true, 8000);
  } finally {
    btn.disabled = false; btn.textContent = 'Refresh exposure';
  }
});

const probColor = (p) => (p >= 0.8 ? '#bd0026' : p >= 0.5 ? '#f03b20' : p >= 0.25 ? '#fd8d3c' : '#fecc5c');

async function sampleExposure() {
  const ex = state.exposure;
  const { values } = await call({ type: 'sample', points: ex.feats.map((f) => [f.lat, f.lon]) });
  ex.feats.forEach((f, i) => { f.depth = values[i]?.depth ?? 0; f.prob = values[i]?.prob ?? 0; });
  const blds = ex.feats.filter((f) => !f.facility);
  const facs = ex.feats.filter((f) => f.facility);
  const likely = blds.filter((f) => f.prob >= 0.5).length;
  const possible = blds.filter((f) => f.prob >= 0.1 && f.prob < 0.5).length;
  const facRisk = facs.filter((f) => f.prob >= 0.1);
  stats($('#exposureStats'), [
    ['Buildings mapped', fmtInt(blds.length) + (ex.truncated ? '+' : '')],
    ['Likely flooded (P ≥ 0.5)', fmtInt(likely)],
    ['Possibly flooded (0.1–0.5)', fmtInt(possible)],
    ['Facilities at risk', `${facRisk.length} / ${facs.length}`],
  ]);
  // Map layer: only buildings and facilities with non-trivial probability
  state.layers.exposure?.remove();
  const group = L.layerGroup();
  const shown = blds.filter((f) => f.prob >= 0.1).sort((a, b) => a.prob - b.prob).slice(-20000);
  for (const f of shown) {
    group.addLayer(L.circleMarker([f.lat, f.lon], { renderer: vecRenderer, radius: 3, weight: 0, fillColor: probColor(f.prob), fillOpacity: 0.95, interactive: false }));
  }
  for (const f of facs) {
    const m = L.circleMarker([f.lat, f.lon], {
      renderer: vecRenderer, radius: 7, weight: 2, color: '#fff', fillColor: f.prob >= 0.1 ? probColor(f.prob) : '#2b8a3e', fillOpacity: 1, bubblingMouseEvents: false,
    });
    m.bindPopup(() => {
      const sev = severity(f.depth);
      return `<div class="pop"><h4>${esc(f.name || f.kind.replace(/_/g, ' '))}</h4>
        <div class="hero"><strong>${depthText(f.depth)}</strong><span class="badge" style="background:${sev.color}">${sev.label}</span></div>
        <table><tr><td>Type</td><td>${esc(f.kind.replace(/_/g, ' '))}</td></tr><tr><td>Chance of flooding</td><td>${Math.round(f.prob * 100)}%</td></tr></table></div>`;
    });
    f.marker = m;
    group.addLayer(m);
  }
  state.layers.exposure = group;
  syncLayers();
  const list = $('#facilityList');
  list.innerHTML = '';
  for (const f of [...facs].sort((a, b) => b.prob - a.prob).slice(0, 60)) {
    const li = document.createElement('li');
    li.className = f.prob >= 0.5 ? 'hot' : '';
    li.innerHTML = `<span>${esc(f.name || f.kind.replace(/_/g, ' '))} <small>· ${esc(f.kind.replace(/_/g, ' '))}</small></span><span>${Math.round(f.prob * 100)}% · ${fmt(f.depth, 1)} m</span>`;
    li.addEventListener('click', () => { map.setView([f.lat, f.lon], Math.max(map.getZoom(), 15)); f.marker.openPopup(); });
    list.append(li);
  }
}

// ---------------- Layers, legend, exports ----------------
$$('[data-layer]').forEach((c) => c.addEventListener('change', syncLayers));
$$('input[name=floodView]').forEach((r) => r.addEventListener('change', syncLayers));
$('#opacity').addEventListener('input', (e) => {
  $('#opacityOut').textContent = `${Math.round(e.target.value * 100)}%`;
  ['hand', 'depth', 'prob'].forEach((k) => state.layers[k]?.setOpacity(+e.target.value));
});

function syncLayers() {
  const on = (k) => $(`[data-layer=${k}]`).checked;
  const view = $('input[name=floodView]:checked').value;
  const want = {
    hill: on('hill'), hand: on('hand'), streams: on('streams'), exposure: on('exposure'),
    depth: on('flood') && view === 'depth', prob: on('flood') && view === 'prob',
  };
  for (const [k, layer] of Object.entries(state.layers)) {
    if (!layer) continue;
    if (want[k] && !map.hasLayer(layer)) layer.addTo(map);
    if (!want[k] && map.hasLayer(layer)) layer.remove();
  }
  state.layers.streams?.eachLayer((l) => l.bringToFront());
  renderLegend(want);
}

function renderLegend(want) {
  const el = $('#legend');
  const parts = [];
  const danger = dangerDepth();
  if (want.depth && state.layers.depth && Number.isFinite(danger)) {
    const pct = Math.min(danger / 6, 1) * 100;
    parts.push(['Flood depth (m)', `linear-gradient(90deg,#9ecae1,#2166ac ${pct}%,#fd8d3c ${pct}%,#bd0026)`, [[0, '0'], [pct, fmt(danger, 1)], [100, '6+']]]);
  } else if (want.depth && state.layers.depth) parts.push(['Flood depth (m)', 'linear-gradient(90deg,#9ecae1,#4292c6,#2166ac,#084594,#081d58)', ['0', '1.5', '3', '6+']]);
  if (want.prob && state.layers.prob) parts.push(['Flood probability', 'linear-gradient(90deg,#ffeda0,#feb24c,#f03b20,#bd0026,#800026)', ['5%', '25%', '50%', '100%']]);
  if (want.hand && state.layers.hand) parts.push(['HAND (m above channel)', 'linear-gradient(90deg,#08306b,#2171b5,#4292c6,#6baed6,#a1d99b,#fee391,#ece2d6)', ['0', '3', '10', '40+']]);
  el.hidden = !parts.length;
  const tickRow = (ticks) => (Array.isArray(ticks[0])
    ? `<div class="ticks abs">${ticks.map(([p, x]) => `<span style="left:${p}%">${x}</span>`).join('')}</div>`
    : `<div class="ticks">${ticks.map((x) => `<span>${x}</span>`).join('')}</div>`);
  el.innerHTML = parts.map(([t, g, ticks]) => `<h4>${t}</h4><div class="ramp" style="background:${g}"></div>${tickRow(ticks)}`).join('<div style="height:10px"></div>');
}

$$('[data-export]').forEach((b) => b.addEventListener('click', async () => {
  try {
    const { buffer } = await call({ type: 'export', layer: b.dataset.export });
    download(`flood_depth_${b.dataset.export}.tif`, buffer, 'image/tiff');
  } catch (err) { toast(err.message, true); }
}));

$('#expReaches').addEventListener('click', () => {
  const a = state.analysis, sc = state.scenario;
  if (!a) return;
  const n = sc?.params.n ?? +$('#manning').value;
  const fc = {
    type: 'FeatureCollection',
    metadata: { generator: 'Flood Depth', manning_n: n, stages_m: a.stages, scenario: sc ? { mode: sc.mode, ...sc.params } : null },
    features: a.reaches.map((r) => ({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: r.line.map(([lat, lon]) => [lon, lat]) },
      properties: {
        reach: r.id + 1, area_km2: +r.areaKm2.toFixed(3), length_m: Math.round(r.lenM), slope: +r.slope.toFixed(5),
        stage_m: sc ? +sc.hR[r.id].toFixed(3) : null, discharge_m3s: sc ? +sc.qR[r.id].toFixed(3) : null,
        rating_q_m3s: r.Q.map((q) => +(q / n).toFixed(3)),
      },
    })),
  };
  download('flood_depth_reaches.geojson', JSON.stringify(fc), 'application/geo+json');
});

$('#expExposure').addEventListener('click', () => {
  const ex = state.exposure;
  if (!ex) return toast('Find exposed buildings first.', true);
  const rows = [['osm_id', 'kind', 'name', 'lat', 'lon', 'depth_m', 'probability']];
  for (const f of ex.feats) rows.push([f.id, f.kind, `"${(f.name || '').replace(/"/g, '""')}"`, f.lat.toFixed(6), f.lon.toFixed(6), f.depth.toFixed(2), f.prob.toFixed(3)]);
  download('flood_depth_exposure.csv', rows.map((r) => r.join(',')).join('\n'), 'text/csv');
});

$('#btnMethod').addEventListener('click', () => $('#method').showModal());

// Console access for power users: floodDepth.state.analysis, floodDepth.map, …
window.floodDepth = { map, state };
