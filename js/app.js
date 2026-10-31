// Flood Depth UI: map, area selection, worker orchestration, exposure and exports.
import * as G from './geo.js';
import { foldStep, peekPanel, restorePanel, makeRoomForMap } from './panel.js';

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
// Scale sits with the other map controls, away from the panel on the left.
L.control.scale({ imperial: false, position: 'bottomright', maxWidth: 110 }).addTo(map);
$$('input[name=basemap]').forEach((r) => r.addEventListener('change', () => {
  for (const [k, layer] of Object.entries(bases)) {
    if (k === r.value) layer.addTo(map); else layer.remove();
  }
}));

// Layers popover
const layersBtn = $('#btnLayers'), layersPop = $('#layersPop');
function toggleLayers(open = layersPop.hidden) {
  if (open) toggleNews(false);
  layersPop.hidden = !open;
  layersBtn.setAttribute('aria-expanded', open);
}
layersBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleLayers(); });
document.addEventListener('click', (e) => { if (!layersPop.hidden && !e.target.closest('.mapctl')) toggleLayers(false); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { toggleLayers(false); $('#searchResults').hidden = true; } });
L.DomEvent.disableClickPropagation($('.mapctl'));
L.DomEvent.disableScrollPropagation(layersPop);

map.attributionControl.getContainer().classList.add('compact');
map.attributionControl.getContainer().addEventListener('click', (e) => {
  if (!e.target.closest('a')) e.currentTarget.classList.toggle('open');
});
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
  console.warn('Overpass failed:', errors.join('; '));
  throw new Error('OpenStreetMap is busy right now. Try again in a minute.');
}
const vecRenderer = L.canvas({ padding: 0.3, tolerance: 6 });

// ---------------- State ----------------
const state = {
  aoi: null, aoiRect: null,
  upload: null,
  analysis: null,
  scenario: null,
  exposure: null,
  layers: { hill: null, hand: null, depth: null, prob: null, streams: null, exposure: null, shapes: null },
  shapes: null,
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
worker.onerror = (e) => { console.error(e); toast('Something went wrong. Reload the page and try again.', 'error'); };
function call(msg, transfer = []) {
  const id = ++rpcId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ ...msg, id }, transfer);
  });
}

// ---------------- UI helpers ----------------
// Toasts are short and calm: 'info' for guidance, 'notice' for something the app worked around,
// 'error' for something the user has to act on. Technical detail goes to the console, not the screen.
let toastTimer;
function toast(msg, kind = 'info', ms) {
  if (kind === true) kind = 'error';
  else if (kind === false) kind = 'info';
  ms ??= kind === 'info' ? 4500 : 6500;
  const t = $('#toast');
  t.className = `toast ${kind}`;
  t.innerHTML = `<svg><use href="#i-${kind === 'info' ? 'info' : 'alert'}"/></svg><span></span>
    <button class="icon" aria-label="Dismiss"><svg><use href="#i-close"/></svg></button>`;
  t.querySelector('span').textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  if (ms) toastTimer = setTimeout(() => (t.hidden = true), ms);
}
$('#toast').addEventListener('click', () => { clearTimeout(toastTimer); $('#toast').hidden = true; });
function setProgress(msg, pct) {
  const p = $('#progress');
  p.hidden = false;
  p.classList.remove('failed');
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
  showConditionsAt(b.getCenter(), name);
  makeRoomForMap();
  fitArea(b);
}

function fitArea(b, maxZoom = 18) {
  map.fitBounds(b, { padding: [24, 24], maxZoom });
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
  fitArea(state.aoi);
  $('#waterLevel').value = p.water ?? 0;
  $('#stage').value = p.stage;
  $('#stageOut').textContent = `${(+p.stage).toFixed(1)} m`;
});

function setAOI(bounds) {
  state.aoi = bounds;
  if (state.aoiRect) state.aoiRect.remove();
  state.aoiRect = L.rectangle(bounds, { color: ACCENT, weight: 2, dashArray: '6 6', fillColor: ACCENT, fillOpacity: 0.04, interactive: false }).addTo(map);
  describeAOI();
  showConditionsAt(bounds.getCenter());
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
  peekPanel();
  map.dragging.disable();
  map.getContainer().classList.add('aoi-drawing');
  toast(matchMedia('(pointer: coarse)').matches ? 'Drag a box on the map with your finger.' : 'Click and drag on the map to draw the analysis area.', false, 3500);
});
function stopDraw() {
  if (drawing?.rect) drawing.rect.remove();
  drawing = null;
  map.dragging.enable();
  map.getContainer().classList.remove('aoi-drawing');
  const btn = $('#btnDraw');
  btn.classList.remove('active');
  btn.querySelector('span').textContent = 'Draw on map';
  restorePanel();
}
// Pointer events, so a box can be drawn with a mouse, a pen or a finger.
const mapEl = map.getContainer();
mapEl.addEventListener('pointerdown', (e) => {
  if (!drawing || !e.isPrimary || e.target.closest('.leaflet-control')) return;
  e.preventDefault();
  try { mapEl.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
  drawing.start = map.mouseEventToLatLng(e);
  drawing.rect = L.rectangle(L.latLngBounds(drawing.start, drawing.start), { color: ACCENT, weight: 2, fillOpacity: 0.08, interactive: false }).addTo(map);
});
mapEl.addEventListener('pointermove', (e) => {
  if (drawing?.start && e.isPrimary) drawing.rect.setBounds(L.latLngBounds(drawing.start, map.mouseEventToLatLng(e)));
});
mapEl.addEventListener('pointerup', (e) => {
  if (!drawing?.start || !e.isPrimary) return;
  const b = L.latLngBounds(drawing.start, map.mouseEventToLatLng(e));
  stopDraw();
  lastDraw = Date.now();
  if (map.latLngToContainerPoint(b.getNorthWest()).distanceTo(map.latLngToContainerPoint(b.getSouthEast())) < 12) return;
  setAOI(b);
});
mapEl.addEventListener('pointercancel', () => { if (drawing?.start) stopDraw(); });

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
    fitArea(b);
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
    foldStep('#stepArea', true);
    foldStep('#stepScenario', false);
    setProgress(`Done in ${fmt(res.stats.seconds)} s`, 100);
    setTimeout(() => ($('#progress').hidden = true), 1800);
    makeRoomForMap();
    showConditionsAt(gridBounds(res.grid).getCenter());
    await runScenario();
    $('#stepScenario').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    setProgress(err.message, 0);
    $('#progress').classList.add('failed');
    // Show the reason where the user acted, and drop any side notice that no longer matters.
    if ($('#toast').classList.contains('notice')) $('#toast').hidden = true;
    foldStep('#stepArea', false);
    $('#progress').scrollIntoView({ behavior: 'smooth', block: 'center' });
  } finally {
    btn.disabled = false;
    btn.textContent = 'Analyze terrain';
  }
}

async function fetchRivers(b) {
  const q = `[out:json][timeout:25];way["waterway"~"^(river|canal)$"](${b.s},${b.w},${b.n},${b.e});out geom;`;
  try {
    const json = await overpass(q, 30000, () => setProgress('Fetching mapped rivers…', 3));
    return json.elements.filter((e) => e.geometry).map((e) => e.geometry.map((p) => [p.lat, p.lon]));
  } catch (err) {
    toast('Mapped rivers didn’t load, so streams are traced from the terrain alone.', 'notice');
    return [];
  }
}

function clearResults() {
  // Uploaded shapes are the user's own data, so they outlive a new analysis; only their flood results reset.
  for (const k of Object.keys(state.layers)) {
    if (k === 'shapes') continue;
    state.layers[k]?.remove(); state.layers[k] = null;
  }
  state.analysis = state.scenario = state.exposure = null;
  $('#terrainStats').hidden = $('#floodStats').hidden = $('#exposureStats').hidden = $('#terrainMore').hidden = true;
  $('#floodWarn').hidden = true;
  $('#facilityList').innerHTML = '';
  $('#legend').hidden = true;
  clearShapeResults();
  checkMe();
}

function rgbaToURL(rgba, W, H) {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer), W, H), 0, 0);
  return new Promise((r) => cv.toBlob((b) => r(URL.createObjectURL(b)), 'image/png'));
}
function gridBounds(g) { return L.latLngBounds([g.bounds.s, g.bounds.w], [g.bounds.n, g.bounds.e]); }

// Zoom levels between the view that fits the area and the current view (0 or less = zoomed in).
function zoomOutBy() {
  const g = state.analysis?.grid;
  const b = g ? gridBounds(g) : state.aoi;
  return b ? map.getBoundsZoom(b) - map.getZoom() : 0;
}
// Past this many levels the area is a speck, so its box, overlays, legend and popups are hidden.
const FAR_ZOOM_OUT = 4;
const zoomedFarOut = () => zoomOutBy() >= FAR_ZOOM_OUT;

// A popup belongs to the zoom it was opened at: zooming out past that closes it,
// so it never sits oversized over a shrinking area. None open once the area is a speck.
let popupZoom = null;
map.on('popupopen', () => {
  if (zoomedFarOut()) return map.closePopup();
  popupZoom = map.getZoom();
});
map.on('popupclose', () => { popupZoom = null; });
map.on('dragstart popupopen', makeRoomForMap);
map.on('click', () => { if (!drawing && Date.now() - lastDraw > 400) makeRoomForMap(); });
map.on('zoomend', () => { if (popupZoom != null && map.getZoom() < popupZoom) map.closePopup(); });
map.on('zoomend', () => syncLayers());

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
  fitArea(gridBounds(g));
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
    styleShapes();
    if (state.shapes?.items[0]?.res) renderShapeSummary();
    checkMe();
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
    await Promise.all([checkShapes(), checkMe()]);
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
    if (!v || (!(v.depth > 0) && v.prob < 0.05) || drawing || popupShown()) { hideTip(); return; }
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
// Any popup in the DOM (opening, open or fading out) suppresses the hover readout.
const popupShown = () => !!map.getContainer().querySelector('.leaflet-popup');
if (matchMedia('(hover: hover)').matches) {
  map.on('mousemove', (e) => {
    if (popupShown()) return hideTip();
    if (state.scenario && !drawing && !zoomedFarOut()) hoverAt(e);
  });
  // mousedown covers the gap between a click and its popup appearing.
  map.on('mousedown mouseout dragstart zoomstart popupopen', hideTip);
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
    const json = await overpass(q, 120000, () => { btn.textContent = 'Querying OpenStreetMap…'; });
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
    toast(err.message, 'error');
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

// ---------------- Conditions: rain, river, flood alerts and news for the place in view ----------------
// Rain from weather models and river discharge from Copernicus GloFAS, both via Open-Meteo (free, no key);
// major flood events from GDACS. All are model or global feeds, so the pane also points to official warnings.
const inKenya = (ll) => ll.lat > -4.72 && ll.lat < 5.03 && ll.lng > 33.9 && ll.lng < 41.91;
const isoDay = (d) => d.toISOString().slice(0, 10);
function dayName(iso, short = false) {
  const days = Math.round((Date.parse(`${iso}T12:00Z`) - Date.parse(`${isoDay(new Date())}T12:00Z`)) / 864e5);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  return new Date(`${iso}T12:00Z`).toLocaleDateString(undefined, short ? { weekday: 'short' } : { weekday: 'short', day: 'numeric', month: 'short' });
}
async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const cond = { key: null, name: null, data: null };
let condTimer;
/** Show conditions for a point; `name` is used when the place came from search. */
function showConditionsAt(ll, name = null) {
  if (name) cond.name = name.split(',')[0];
  clearTimeout(condTimer);
  condTimer = setTimeout(() => loadConditions(ll), 300);
}

async function loadConditions(ll) {
  const reaches = state.analysis?.reaches;
  const key = `${ll.lat.toFixed(2)},${ll.lng.toFixed(2)}|${reaches ? JSON.stringify(state.analysis.grid.bounds) : ''}`;
  if (cond.key === key) return;
  cond.key = key;
  const hint = $('#nowHint'), tiles = $('#nowTiles');
  hint.hidden = true;
  tiles.hidden = false;
  tiles.classList.add('loading');
  // River candidates: along the analysed main river if there is one, else a ~25 km grid around the point.
  let cands;
  if (reaches?.length) {
    const main = reaches.reduce((x, r) => (r.areaKm2 > x.areaKm2 ? r : x));
    const n = main.line.length;
    cands = Array.from({ length: 8 }, (_, k) => main.line[Math.round(k * (n - 1) / 7)]);
    const [olat, olon] = main.line[n - 1];
    for (const dy of [-0.05, 0, 0.05]) for (const dx of [-0.05, 0, 0.05]) cands.push([olat + dy, olon + dx]);
  } else {
    cands = [];
    for (const dy of [-0.1, -0.05, 0, 0.05, 0.1]) for (const dx of [-0.1, -0.05, 0, 0.05, 0.1]) cands.push([ll.lat + dy, ll.lng + dx]);
  }
  const [place, rain, river, alerts] = await Promise.allSettled([
    cond.name ? Promise.resolve({ name: cond.name }) : placeName(ll),
    rainOutlook(ll), riverOutlook(cands), floodAlerts(ll),
  ]);
  if (cond.key !== key) return;
  const val = (r, what) => { if (r.status === 'rejected') console.warn(`${what} unavailable:`, r.reason); return r.value ?? null; };
  cond.name = null;
  cond.data = { ll, place: val(place, 'Place name'), rain: val(rain, 'Rain forecast'), river: val(river, 'River forecast'), alerts: val(alerts, 'Flood alerts') };
  renderConditions();
}

async function placeName(ll) {
  const r = await getJSON(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&lat=${ll.lat.toFixed(4)}&lon=${ll.lng.toFixed(4)}`);
  const a = r.address || {};
  return { name: a.city || a.town || a.village || a.county || a.state_district || a.state || r.name || '' };
}

async function rainOutlook(c) {
  const r = await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${c.lat.toFixed(3)}&longitude=${c.lng.toFixed(3)}&daily=precipitation_sum&past_days=7&forecast_days=7&timezone=auto`);
  const mm = r.daily.precipitation_sum.map((v) => v ?? 0), t = r.daily.time;
  const today = 7;
  let i = today;
  for (let k = today; k < mm.length; k++) if (mm[k] > mm[i]) i = k;
  return {
    days: t, mm, today, max: mm[i], day: t[i],
    ahead: mm.slice(today).reduce((s, v) => s + v, 0),
    past: mm.slice(0, today).reduce((s, v) => s + v, 0),
  };
}

async function riverOutlook(cands) {
  // GloFAS snaps to its own 5 km river network, so try several cells and keep the one carrying the most
  // water: that is the main river.
  const coords = (i) => cands.map((c) => c[i].toFixed(4)).join(',');
  const found = [].concat(await getJSON(`https://flood-api.open-meteo.com/v1/flood?latitude=${coords(0)}&longitude=${coords(1)}&daily=river_discharge_median&past_days=7&forecast_days=1`));
  const best = found.reduce((b, r) => {
    const m = Math.max(0, ...r.daily.river_discharge_median.filter(Number.isFinite));
    return m > b.m ? { m, r } : b;
  }, { m: 0, r: null });
  if (!best.r || best.m < 0.5) return null;
  const today = new Date(), start = new Date(today), end = new Date(today);
  start.setUTCFullYear(start.getUTCFullYear() - 3);
  end.setUTCDate(end.getUTCDate() + 9);
  const h = await getJSON(`https://flood-api.open-meteo.com/v1/flood?latitude=${best.r.latitude}&longitude=${best.r.longitude}&daily=river_discharge,river_discharge_max&start_date=${isoDay(start)}&end_date=${isoDay(end)}`);
  const t = h.daily.time, q = h.daily.river_discharge, qmax = h.daily.river_discharge_max || [];
  let iNow = t.indexOf(isoDay(today));
  if (iNow < 0) iNow = t.length - 10;
  const past = q.slice(0, iNow).filter(Number.isFinite).sort((x, y) => x - y);
  if (past.length < 100) return null;
  const pct = (p) => past[Math.min(past.length - 1, Math.floor(p * past.length))];
  let iPeak = iNow, upper = 0;
  for (let i = iNow; i < q.length; i++) {
    if (q[i] > q[iPeak]) iPeak = i;
    if (Number.isFinite(qmax[i])) upper = Math.max(upper, qmax[i]);
  }
  const high = pct(0.95);
  // The 51-run GloFAS ensemble turns the forecast into chances: of a noticeable rise, and of high water.
  let chance = null;
  try {
    const e = await getJSON(`https://flood-api.open-meteo.com/v1/flood?latitude=${best.r.latitude}&longitude=${best.r.longitude}&daily=river_discharge&ensemble=true&forecast_days=10`);
    const runs = Object.entries(e.daily).filter(([k]) => k.startsWith('river_discharge')).map(([, v]) => v.filter(Number.isFinite));
    const peaks = runs.filter((r) => r.length).map((r) => ({ peak: Math.max(...r), day: r.findIndex((v) => v >= high) }));
    if (peaks.length >= 10) {
      const firstHigh = peaks.map((p) => p.day).filter((d) => d >= 0).sort((a, b) => a - b);
      chance = {
        runs: peaks.length,
        rise: peaks.filter((p) => p.peak >= q[iNow] * 1.1).length / peaks.length,
        high: firstHigh.length / peaks.length,
        highFrom: firstHigh.length ? e.daily.time[firstHigh[0]] : null,
      };
    }
  } catch (err) { console.warn('River ensemble unavailable:', err); }
  return {
    now: q[iNow], peak: q[iPeak], peakDay: t[iPeak], upper, chance,
    p20: pct(0.2), median: pct(0.5), p80: pct(0.8), high, max: past[past.length - 1],
    series: q.slice(Math.max(0, iNow - 60)), today: Math.min(60, iNow),
  };
}

// Major floods (GDACS) of the last 60 days within ~600 km; the event list is fetched once per visit.
let gdacsEvents = null;
async function floodAlerts(ll) {
  if (!gdacsEvents) {
    const to = new Date(), from = new Date(to);
    from.setUTCDate(from.getUTCDate() - 60);
    gdacsEvents = getJSON(`https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=FL&fromDate=${isoDay(from)}&toDate=${isoDay(to)}`)
      .then((d) => d.features || [])
      .catch((err) => { gdacsEvents = null; throw err; });
  }
  const rank = { Red: 3, Orange: 2, Green: 1 };
  return (await gdacsEvents)
    .map((f) => ({ ...f.properties, km: ll.distanceTo(L.latLng(f.geometry.coordinates[1], f.geometry.coordinates[0])) / 1000 }))
    .filter((e) => e.km < 600)
    .sort((a, b) => (rank[b.alertlevel] || 0) - (rank[a.alertlevel] || 0) || a.km - b.km);
}

// How the coming peak compares with this river's last three years.
function flowLevel(v, r) {
  if (v >= r.max) return { label: 'Highest in 3 years', tone: 'danger' };
  if (v >= r.high) return { label: 'High', tone: 'danger' };
  if (v >= r.p80) return { label: 'Above usual', tone: 'warn' };
  if (v >= r.p20) return { label: 'Usual', tone: 'ok' };
  return { label: 'Low', tone: 'ok' };
}
function rainLevel(mm) {
  if (mm >= 50) return { label: 'Heavy rain', tone: 'danger' };
  if (mm >= 20) return { label: 'Moderate rain', tone: 'warn' };
  return { label: mm >= 1 ? 'Light rain' : 'Mostly dry', tone: 'ok' };
}

function sparkline(r) {
  const W = 160, H = 34, v = r.series, top = Math.max(r.high, ...v.filter(Number.isFinite)) * 1.08 || 1;
  const x = (i) => (i / (v.length - 1)) * W, y = (q) => H - 2 - (q / top) * (H - 4);
  const path = (from, to) => v.slice(from, to + 1).map((q, k) => `${k ? 'L' : 'M'}${x(from + k).toFixed(1)},${y(q).toFixed(1)}`).join('');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="River flow over the last two months and the next ten days; dashed red line marks high flow">
    <line class="hi" x1="0" x2="${W}" y1="${y(r.high)}" y2="${y(r.high)}"/>
    <line class="now" x1="${x(r.today)}" x2="${x(r.today)}" y1="0" y2="${H}"/>
    <path class="past" d="${path(0, r.today)}"/><path class="next" d="${path(r.today, v.length - 1)}"/></svg>`;
}
function rainBars(r) {
  const W = 160, H = 34, n = r.mm.length, bw = W / n, top = Math.max(25, ...r.mm);
  return `<svg class="bars" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Daily rain for the past week and the week ahead">
    ${r.mm.map((v, i) => {
      const h = Math.max(v > 0 ? 1.5 : 0, (v / top) * (H - 2));
      return `<rect class="${i < r.today ? 'past' : i === r.today ? 'today' : 'next'}${v >= 50 ? ' heavy' : ''}" x="${(i * bw + 1).toFixed(1)}" y="${(H - h).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${h.toFixed(1)}" rx="1.5"/>`;
    }).join('')}</svg>`;
}

function tile({ cls, icon, title, value, chart = '', status = '', tone = '' }) {
  return `<article class="tile ${cls}">
    <header><svg><use href="#i-${icon}"/></svg><span>${title}</span></header>
    <div class="big">${value}</div>${chart}
    ${status ? `<p class="status ${tone}">${status}</p>` : ''}</article>`;
}

// Ring gauge for the chance of a rise; the second figure is the chance of reaching high water.
function chanceTile(c) {
  const pct = Math.round(c.rise * 100), hi = Math.round(c.high * 100);
  const tone = c.high >= 0.5 ? 'danger' : c.high >= 0.2 || c.rise >= 0.5 ? 'warn' : 'ok';
  const C = 2 * Math.PI * 22;
  return `<article class="tile chance ${tone}">
    <svg class="ring" viewBox="0 0 56 56" aria-hidden="true"><circle cx="28" cy="28" r="22"/><circle class="val" cx="28" cy="28" r="22"
      stroke-dasharray="${(C * c.rise).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 28 28)"/></svg>
    <div><header><svg><use href="#i-wave"/></svg><span>Chance the river rises</span></header>
      <div class="big">${pct}<small>% in 10 days</small></div>
      <p class="status ${tone}">${hi}% chance of high water${c.highFrom ? `, from ${dayName(c.highFrom, true)}` : ''} · ${c.runs} forecast runs</p></div>
  </article>`;
}

// Headlines are written from the data: only things worth a reader's attention make the paper.
function headlines({ ll, place, rain, river, alerts }) {
  const out = [], where = place?.name || 'this area', at = `${ll.lat.toFixed(1)},${ll.lng.toFixed(1)}`;
  for (const e of (alerts || []).slice(0, 3)) {
    out.push({
      id: `gdacs-${e.eventid}-${e.episodeid}`, tone: e.alertlevel === 'Red' ? 'danger' : e.alertlevel === 'Orange' ? 'warn' : 'ok',
      title: `${e.alertlevel} flood alert: ${e.name}`, url: e.url.report,
      meta: `${fmtInt(e.km)} km away · since ${dayName(e.fromdate.slice(0, 10))} · GDACS`,
    });
  }
  if (rain) {
    const wet = rain.mm.map((mm, k) => ({ mm, k })).filter(({ mm, k }) => k >= rain.today && mm >= 20)
      .sort((a, b) => b.mm - a.mm).slice(0, 2);
    for (const { mm, k } of wet) {
      out.push({
        id: `rain-${at}-${rain.days[k]}`, tone: mm >= 50 ? 'danger' : 'warn',
        title: `${mm >= 50 ? 'Heavy' : 'Moderate'} rain ${dayName(rain.days[k])}`,
        meta: `${fmt(mm, 0)} mm forecast in ${where} · weather models`,
      });
    }
    if (rain.past >= 50) {
      out.push({
        id: `wet-${at}-${rain.days[rain.today]}`, tone: 'warn', title: 'Ground already wet',
        meta: `${fmt(rain.past, 0)} mm fell in the past week, so new rain runs off faster`,
      });
    }
  }
  if (river) {
    const lv = flowLevel(river.peak, river);
    if (lv.tone !== 'ok') {
      out.push({
        id: `river-${at}-${river.peakDay}`, tone: lv.tone, title: `River ${lv.label.toLowerCase()} by ${dayName(river.peakDay)}`,
        meta: `Peak ${fmtInt(river.peak)} m³/s against a usual ${fmtInt(river.median)} · GloFAS`,
      });
    }
    const c = river.chance;
    if (c && c.high >= 0.2) {
      out.push({
        id: `riverhigh-${at}-${c.highFrom}`, tone: c.high >= 0.5 ? 'danger' : 'warn',
        title: `${Math.round(c.high * 100)}% chance the river reaches high water`,
        meta: `${c.highFrom ? `From ${dayName(c.highFrom)} · ` : ''}${Math.round(c.high * c.runs)} of ${c.runs} GloFAS forecast runs`,
      });
    }
  }
  return out;
}

// Read state lives in this browser only.
const readStore = {
  get() { try { return new Set(JSON.parse(localStorage.getItem('floodDepth.read')) || []); } catch { return new Set(); } },
  set(ids) { try { localStorage.setItem('floodDepth.read', JSON.stringify([...ids].slice(-300))); } catch { /* storage unavailable */ } },
};
let newsItems = [];

function renderHeadlines() {
  const read = readStore.get();
  const box = $('#newsHeadlines');
  const unread = newsItems.filter((h) => !read.has(h.id)).length;
  box.innerHTML = `<div class="hl-head"><h3>Headlines</h3>${unread ? '<button class="linkish" data-act="all-read">Mark all read</button>' : ''}</div>
    ${newsItems.length ? newsItems.map((h) => `<article class="headline tone-${h.tone}${read.has(h.id) ? '' : ' unread'}" data-id="${esc(h.id)}">
      <button class="dot" data-act="toggle" aria-label="${read.has(h.id) ? 'Mark as unread' : 'Mark as read'}" title="${read.has(h.id) ? 'Mark as unread' : 'Mark as read'}"></button>
      <div><h4>${h.url ? `<a href="${esc(h.url)}" target="_blank" rel="noopener">${esc(h.title)}</a>` : esc(h.title)}</h4><p>${esc(h.meta)}</p></div>
    </article>`).join('') : '<p class="quiet">All quiet: no flood alerts, heavy rain or high rivers ahead.</p>'}`;
  const badge = $('#newsCount');
  badge.hidden = !unread;
  badge.textContent = unread > 9 ? '9+' : unread;
  $('#btnNews').setAttribute('aria-label', `Flood news and conditions${unread ? `, ${unread} unread` : ''}`);
}

$('#newsHeadlines').addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]')?.dataset.act;
  const item = e.target.closest('.headline');
  const read = readStore.get();
  if (act === 'all-read') newsItems.forEach((h) => read.add(h.id));
  else if (item && act === 'toggle') { const id = item.dataset.id; if (read.has(id)) read.delete(id); else read.add(id); }
  else if (item) read.add(item.dataset.id); // opening or tapping a headline reads it
  else return;
  readStore.set(read);
  renderHeadlines();
});

function renderConditions() {
  const { ll, place, rain, river } = cond.data;
  const tiles = $('#nowTiles');
  tiles.classList.remove('loading');
  $('#nowTitle').textContent = place?.name || 'This area';
  newsItems = headlines(cond.data);
  renderHeadlines();

  const html = [];
  if (rain) {
    const lv = rainLevel(rain.max);
    html.push(tile({ cls: 'rain', icon: 'rain', title: 'Rain',
      value: `${fmt(rain.max, 0)}<small>mm ${dayName(rain.day, true)}</small>`, chart: rainBars(rain),
      status: `${lv.label} · ${fmt(rain.ahead, 0)} mm this week`, tone: lv.tone }));
  } else html.push(tile({ cls: 'rain', icon: 'rain', title: 'Rain', value: '—', status: 'Forecast unavailable' }));
  if (river) {
    const lv = flowLevel(river.peak, river);
    html.push(tile({ cls: 'river', icon: 'wave', title: state.analysis ? 'Main river' : 'Nearest river',
      value: `${fmtInt(river.now)}<small>m³/s</small>`, chart: sparkline(river),
      status: `${lv.label} · peak ${fmtInt(river.peak)} ${dayName(river.peakDay, true)}`, tone: lv.tone }));
  } else html.push(tile({ cls: 'river', icon: 'wave', title: 'River', value: '—', status: 'No mapped river flow here' }));
  if (river?.chance) html.push(chanceTile(river.chance));
  tiles.innerHTML = html.join('');

  // With an analysis in place, the forecasts become one-tap scenarios.
  const use = [];
  if (state.analysis && river) {
    use.push(`<button class="chip" data-flow="${Math.round(river.peak)}">River peak <b>${fmtInt(river.peak)}</b></button>`,
      `<button class="chip" data-flow="${Math.round(river.high)}">High flow <b>${fmtInt(river.high)}</b></button>`);
  }
  if (state.analysis && rain?.max >= 1) use.push(`<button class="chip" data-rain="${Math.round(rain.max)}">Rain <b>${fmt(rain.max, 0)} mm</b></button>`);
  $('#nowUse').innerHTML = use.length ? `<span>Try in scenario</span>${use.join('')}` : '';

  const q = encodeURIComponent(`${place?.name || ''} flood`.trim());
  const official = [
    ...(inKenya(ll) ? [['Kenya Met', 'https://meteo.go.ke'], ['ICPAC', 'https://www.icpac.net']] : []),
    ['GDACS', 'https://www.gdacs.org'], ['GloFAS', 'https://global-flood.emergency.copernicus.eu'],
  ];
  $('#nowLinks').innerHTML = `<a class="news-link" href="https://news.google.com/search?q=${q}" target="_blank" rel="noopener">Flood news${place?.name ? ` for ${esc(place.name)}` : ''} ›</a>
    <span>Official: ${official.map(([n, u]) => `<a href="${u}" target="_blank" rel="noopener">${n}</a>`).join(' · ')}</span>`;
  $('#nowFoot').hidden = false;
}

$('#nowUse').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.flow) {
    $('#qref').value = b.dataset.flow;
    $('#modeTabs [data-mode=flow]').click();
  } else if (b.dataset.rain) {
    $('#p24').value = b.dataset.rain;
    $('#modeTabs [data-mode=rain]').click();
  }
  toggleNews(false);
  restorePanel();
  $('#stepScenario').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// The paper: closed by default, it opens beside its button on the map side, away from the main panel.
const newsBtn = $('#btnNews'), newsPop = $('#newsPop');
function toggleNews(open = newsPop.hidden) {
  if (open === !newsPop.hidden) return;
  newsPop.hidden = !open;
  newsBtn.setAttribute('aria-expanded', open);
  if (open) {
    toggleLayers(false);
    peekPanel();
  } else {
    restorePanel();
  }
}
newsBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleNews(); });
$('#newsClose').addEventListener('click', () => toggleNews(false));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggleNews(false); });
L.DomEvent.disableScrollPropagation(newsPop);
$('#newsDate').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

// ---------------- My location & alerts ----------------
const me = { watch: null, latlng: null, marker: null, circle: null, level: null, dismissed: null, notify: false, gen: 0 };
const locBtn = $('#btnLocate'), meAlert = $('#meAlert');
locBtn.addEventListener('click', () => (me.watch != null ? stopLocate() : startLocate()));

function startLocate() {
  if (!('geolocation' in navigator)) return toast('This browser can’t share your location.', 'notice');
  if (!isSecureContext) return toast('Location needs a secure (https) connection.', 'notice');
  locBtn.classList.add('busy');
  locBtn.setAttribute('aria-pressed', 'true');
  let first = true;
  me.watch = navigator.geolocation.watchPosition((pos) => {
    me.latlng = L.latLng(pos.coords.latitude, pos.coords.longitude);
    drawMe(pos.coords.accuracy);
    if (first) {
      first = false;
      locBtn.classList.replace('busy', 'active');
      firstFix(me.latlng);
    }
    checkMe();
  }, (err) => {
    toast(err.code === err.PERMISSION_DENIED
      ? 'Location is off. Allow it in your browser’s site settings to get flood alerts.'
      : 'Couldn’t find your location. Try again outdoors or with Wi-Fi on.', 'notice');
    stopLocate();
  }, { enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 });
}

function stopLocate() {
  if (me.watch != null) navigator.geolocation.clearWatch(me.watch);
  me.watch = me.latlng = me.level = me.dismissed = null;
  me.marker?.remove(); me.circle?.remove();
  me.marker = me.circle = null;
  locBtn.classList.remove('busy', 'active');
  locBtn.setAttribute('aria-pressed', 'false');
  meAlert.hidden = alertBtn.hidden = true;
}

function drawMe(acc) {
  if (!me.marker) {
    me.circle = L.circle(me.latlng, { radius: acc, color: ACCENT, weight: 1, opacity: 0.4, fillColor: ACCENT, fillOpacity: 0.1, interactive: false }).addTo(map);
    me.marker = L.circleMarker(me.latlng, { radius: 7, color: '#fff', weight: 3, fillColor: ACCENT, fillOpacity: 1, bubblingMouseEvents: false })
      .on('click', () => { me.dismissed = null; showAlert(true); })
      .addTo(map);
  } else {
    me.marker.setLatLng(me.latlng);
    me.circle.setLatLng(me.latlng).setRadius(acc);
  }
}

function firstFix(ll) {
  const inGrid = state.analysis && gridBounds(state.analysis.grid).contains(ll);
  map.setView(ll, Math.max(map.getZoom(), inGrid ? 14 : 13));
  if (state.analysis || state.upload || state.aoi?.contains(ll)) return;
  // No analysis yet: put a ~10 km box around the user so one tap on Analyze checks their area.
  const dLat = 5 / 110.57, dLon = 5 / (111.32 * Math.cos(ll.lat * Math.PI / 180));
  setDemSource('global');
  setAOI(L.latLngBounds([ll.lat - dLat, ll.lng - dLon], [ll.lat + dLat, ll.lng + dLon]));
  toast('Analysis area set around you. Tap “Analyze terrain” to check your flood risk.', false, 6000);
}

// Numbers offered with a flood alert: in Kenya the Red Cross toll-free line and the national emergency line,
// elsewhere 112, which reaches emergency services from most mobile phones.
function hotlines(ll) {
  return inKenya(ll) ? [['Kenya Red Cross', '1199'], ['Emergency', '999']] : [['Emergency', '112']];
}

async function checkMe() {
  if (!me.latlng) return;
  const gen = ++me.gen;
  let level, mark = '', title, detail, text = '';
  if (!state.scenario) {
    level = 'none';
    title = 'Location on';
    detail = 'Analyze an area that includes you to get flood alerts here.';
  } else {
    let v = null;
    try { ({ values: [v] } = await call({ type: 'sample', points: [[me.latlng.lat, me.latlng.lng]] })); } catch { return; }
    if (gen !== me.gen) return;
    if (!v) {
      level = 'out';
      title = 'No alert for your location';
      detail = 'You are outside the analysed area.';
    } else if (!(v.depth > 0) && v.prob < 0.05) {
      level = 'dry';
      mark = '<span class="badge" style="background:#34c759">Dry</span>';
      title = 'Your location stays dry';
      detail = 'It does not flood in the scenario you have set.';
    } else {
      const sev = severity(v.depth);
      level = sev.label === 'Dangerous' ? 'danger' : 'wet';
      mark = `<span class="badge" style="background:${sev.color}">${sev.label}</span>`;
      title = v.depth > 0 ? `${depthText(v.depth)} deep at your location` : 'Your location is at the flood edge';
      detail = `${Math.round(v.prob * 100)}% chance of flooding in this scenario.`
        + (level === 'danger' ? ' Move to higher ground and follow official guidance.' : '');
      text = `${title} · ${detail}`;
    }
  }
  const changed = level !== me.level;
  if (changed && level === 'danger' && me.notify && document.hidden) {
    new Notification('Flood Depth: dangerous depth at your location', { body: text, tag: 'flood-depth-me' });
  }
  me.level = level;
  if (changed) me.dismissed = null;
  const canNotify = 'Notification' in window && Notification.permission !== 'denied' && !me.notify && level !== 'none';
  const calls = level === 'danger' || level === 'wet'
    ? hotlines(me.latlng).map(([name, num]) => `<a class="hotline" href="tel:${num}"><svg><use href="#i-phone"/></svg>${name} <b>${num}</b></a>`).join('')
    : '';
  meAlert.className = `me-alert ${level}`;
  meAlert.innerHTML = `
    <div class="me-head">${mark}<b>${title}</b>
      <button class="icon" data-act="close" title="Dismiss" aria-label="Dismiss alert"><svg><use href="#i-close"/></svg></button></div>
    <p>${detail}</p>
    ${calls || canNotify ? `<div class="me-actions">${calls}
      ${canNotify ? '<button class="chip" data-act="notify"><svg><use href="#i-bell"/></svg>Notify me</button>' : ''}</div>` : ''}`;
  showAlert(me.dismissed !== level);
}

// The callout hangs from the location button; dismissed, it shrinks to a small alert icon below it.
const alertBtn = $('#btnAlert');
function showAlert(open) {
  meAlert.hidden = !open;
  alertBtn.hidden = open || !me.latlng;
  alertBtn.className = `fab mini ${me.level || ''}`;
}
alertBtn.addEventListener('click', () => { me.dismissed = null; showAlert(true); });
meAlert.addEventListener('click', async (e) => {
  const act = e.target.closest('button')?.dataset.act;
  if (act === 'close') { me.dismissed = me.level; showAlert(false); }
  if (act === 'notify') {
    me.notify = (await Notification.requestPermission()) === 'granted';
    toast(me.notify ? 'You’ll get a notification if your location turns dangerous while this tab is in the background.' : 'Notifications are off for this site.', me.notify ? 'info' : 'notice');
    checkMe();
  }
});

// ---------------- Your shapes (shapefile / GeoJSON) ----------------
let shpReader = null;
function loadShpReader() {
  shpReader ||= new Promise((resolve, reject) => {
    const s = Object.assign(document.createElement('script'), { src: 'https://unpkg.com/shpjs@6.1.0/dist/shp.min.js', crossOrigin: '' });
    s.onload = () => resolve(window.shp);
    s.onerror = () => { shpReader = null; reject(new Error('Could not load the shapefile reader. Check your connection.')); };
    document.head.append(s);
  });
  return shpReader;
}

async function readShapes(list) {
  const files = [...list];
  const pick = (...exts) => files.find((f) => exts.some((x) => f.name.toLowerCase().endsWith(x)));
  const json = pick('.geojson', '.json');
  if (json) {
    const g = JSON.parse(await json.text());
    const feats = g.type === 'FeatureCollection' ? g.features : g.type === 'Feature' ? [g] : [{ type: 'Feature', properties: {}, geometry: g }];
    return { name: json.name, feats };
  }
  const zip = pick('.zip'), main = pick('.shp');
  if (!zip && !main) throw new Error('Choose a zipped shapefile, the .shp with its .dbf and .prj, or a GeoJSON file.');
  const shp = await loadShpReader();
  let out;
  if (zip) out = await shp(await zip.arrayBuffer());
  else {
    const parts = { shp: await main.arrayBuffer() };
    const dbf = pick('.dbf'), prj = pick('.prj'), cpg = pick('.cpg');
    if (dbf) parts.dbf = await dbf.arrayBuffer();
    if (prj) parts.prj = await prj.text();
    if (cpg) parts.cpg = await cpg.text();
    out = await shp(parts);
  }
  return { name: (zip || main).name, feats: [].concat(out).flatMap((fc) => fc.features || []) };
}

// Points at which each feature is checked: vertices, points along lines, and a grid inside polygons.
function samplePoints(geom) {
  const pts = [];
  const ring = (r, n) => { const k = Math.max(1, Math.ceil(r.length / n)); for (let i = 0; i < r.length; i += k) pts.push([r[i][1], r[i][0]]); };
  const line = (l) => {
    const total = l.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - l[i - 1][0], p[1] - l[i - 1][1]) : 0), 0);
    const step = total / 150 || 1;
    for (let i = 1; i < l.length; i++) {
      const [x0, y0] = l[i - 1], [x1, y1] = l[i];
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
      for (let j = 0; j < n; j++) pts.push([y0 + (y1 - y0) * j / n, x0 + (x1 - x0) * j / n]);
    }
    if (l.length) pts.push([l[l.length - 1][1], l[l.length - 1][0]]);
  };
  const inRing = (x, y, r) => {
    let inside = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      if ((r[i][1] > y) !== (r[j][1] > y) && x < (r[j][0] - r[i][0]) * (y - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) inside = !inside;
    }
    return inside;
  };
  const poly = (rings) => {
    const outer = rings[0];
    if (!outer?.length) return;
    let w = Infinity, e = -Infinity, s = Infinity, n = -Infinity;
    for (const [x, y] of outer) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
    const N = 18;
    for (let a = 0; a < N; a++) {
      for (let b = 0; b < N; b++) {
        const x = w + (e - w) * (a + 0.5) / N, y = s + (n - s) * (b + 0.5) / N;
        if (inRing(x, y, outer) && !rings.slice(1).some((h) => inRing(x, y, h))) pts.push([y, x]);
      }
    }
    ring(outer, 60);
  };
  const walk = (g) => {
    if (!g) return;
    switch (g.type) {
      case 'Point': pts.push([g.coordinates[1], g.coordinates[0]]); break;
      case 'MultiPoint': g.coordinates.forEach((c) => pts.push([c[1], c[0]])); break;
      case 'LineString': line(g.coordinates); break;
      case 'MultiLineString': g.coordinates.forEach(line); break;
      case 'Polygon': poly(g.coordinates); break;
      case 'MultiPolygon': g.coordinates.forEach(poly); break;
      case 'GeometryCollection': g.geometries.forEach(walk); break;
    }
  };
  walk(geom);
  return pts;
}

const NAME_KEYS = /^(name|nom|nombre|title|label|site|id|fid|objectid)$/i;
function shapeName(f, i) {
  const p = f.properties || {};
  const k = Object.keys(p).find((key) => NAME_KEYS.test(key) && p[key] !== '' && p[key] != null);
  return k ? String(p[k]) : `Feature ${i + 1}`;
}

async function loadShapes(files) {
  const info = $('#shapesInfo');
  info.hidden = false;
  info.classList.remove('err');
  info.textContent = 'Reading…';
  try {
    const { name, feats: raw } = await readShapes(files);
    const feats = raw.filter((f) => f?.geometry);
    if (!feats.length) throw new Error('No features with geometry were found in that file.');
    const b = L.geoJSON({ type: 'FeatureCollection', features: feats }).getBounds();
    if (!b.isValid() || Math.abs(b.getWest()) > 180 || Math.abs(b.getEast()) > 180 || Math.abs(b.getNorth()) > 90 || Math.abs(b.getSouth()) > 90) {
      throw new Error('These coordinates are not longitude/latitude. Include the .prj file, or reproject to WGS84.');
    }
    state.shapes = { name, items: feats.map((f, i) => ({ f, i, name: shapeName(f, i), pts: samplePoints(f.geometry), res: null })) };
    buildShapesLayer();
    info.textContent = `${name}: ${feats.length.toLocaleString()} feature${feats.length > 1 ? 's' : ''}`;
    $('#expShapes').hidden = false;
    makeRoomForMap();
    fitArea(b, 15);
    if (!state.analysis && !state.upload) {
      // The shapes' extent (with a margin, and at least ~3 km across) becomes the analysis area.
      const c = b.getCenter();
      const minLat = 1.5 / 110.57, minLon = 1.5 / (111.32 * Math.cos(c.lat * Math.PI / 180));
      const padLat = Math.max((b.getNorth() - b.getSouth()) * 0.15, minLat), padLon = Math.max((b.getEast() - b.getWest()) * 0.15, minLon);
      setDemSource('global');
      setAOI(L.latLngBounds([b.getSouth() - padLat, b.getWest() - padLon], [b.getNorth() + padLat, b.getEast() + padLon]));
      toast('Analysis area set to your shapes. Tap “Analyze terrain” to check them.', false, 6000);
    } else {
      await checkShapes();
    }
  } catch (err) {
    info.textContent = err.message;
    info.classList.add('err');
  }
}
$('#fileShapes').addEventListener('change', (e) => { if (e.target.files.length) loadShapes(e.target.files); e.target.value = ''; });
// Drop files anywhere on the app.
$('#app').addEventListener('dragover', (e) => {
  if (![...e.dataTransfer.types].includes('Files')) return;
  e.preventDefault();
  $('#app').classList.add('dropping');
});
$('#app').addEventListener('dragleave', (e) => { if (!e.relatedTarget || !$('#app').contains(e.relatedTarget)) $('#app').classList.remove('dropping'); });
$('#app').addEventListener('drop', (e) => {
  e.preventDefault();
  $('#app').classList.remove('dropping');
  const files = e.dataTransfer.files;
  if (!files.length) return;
  if ([...files].some((f) => /\.tiff?$/i.test(f.name))) return toast('For elevation data, use Terrain settings → My GeoTIFF.', 'notice');
  loadShapes(files);
});

const isPoint = (it) => /Point$/.test(it.f.geometry.type);
function shapeStyle(it) {
  const r = it.res;
  const color = !r ? ACCENT : r.outside ? '#8e8e93' : severity(r.depth).color;
  if (isPoint(it)) return { radius: 6, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 };
  return { color, weight: 2.5, opacity: 0.95, fillColor: color, fillOpacity: r && !r.outside && r.depth > 0 ? 0.3 : 0.12, dashArray: r?.outside ? '5 5' : null };
}

function buildShapesLayer() {
  const sh = state.shapes;
  state.layers.shapes?.remove();
  const byFeature = new Map(sh.items.map((it) => [it.f, it]));
  state.layers.shapes = L.geoJSON({ type: 'FeatureCollection', features: sh.items.map((it) => it.f) }, {
    renderer: vecRenderer,
    style: (f) => shapeStyle(byFeature.get(f)),
    pointToLayer: (f, ll) => L.circleMarker(ll, { ...shapeStyle(byFeature.get(f)), renderer: vecRenderer }),
    onEachFeature: (f, layer) => {
      const it = byFeature.get(f);
      it.layer = layer;
      layer.options.bubblingMouseEvents = false;
      layer.bindPopup(() => shapePopup(it), { maxWidth: 280 });
    },
  });
  syncLayers();
}

function styleShapes() {
  for (const it of state.shapes?.items || []) it.layer?.setStyle(shapeStyle(it));
}

function shapePopup(it) {
  const r = it.res;
  const props = Object.entries(it.f.properties || {}).filter(([, v]) => v !== '' && v != null && typeof v !== 'object').slice(0, 6);
  const area = !isPoint(it);
  let head;
  if (!r) head = '<p class="hint">Analyze terrain to check this feature.</p>';
  else if (r.outside) head = '<p class="hint">Outside the analysed area.</p>';
  else {
    const sev = severity(r.depth);
    head = `<div class="hero"><strong>${depthText(r.depth)}</strong><span class="badge" style="background:${sev.color}">${sev.label}</span></div>`;
  }
  const rows = r && !r.outside ? [
    [area ? 'Deepest point' : 'Depth', depthText(r.depth)],
    ['Chance of flooding', `${Math.round(r.prob * 100)}%`],
    ...(area ? [['Share under water', `${Math.round(r.share * 100)}%`]] : []),
  ] : [];
  rows.push(...props.map(([k, v]) => [esc(k), esc(v)]));
  return `<div class="pop"><h4>${esc(it.name)}</h4>${head}
    <table>${rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</table></div>`;
}

async function checkShapes() {
  const sh = state.shapes;
  if (!sh || !state.scenario) return;
  const { values } = await call({ type: 'sample', points: sh.items.flatMap((it) => it.pts) });
  let k = 0;
  for (const it of sh.items) {
    const vs = values.slice(k, k += it.pts.length).filter(Boolean);
    it.res = !vs.length ? { outside: true, depth: 0, prob: 0, share: 0 } : {
      outside: false,
      depth: Math.max(...vs.map((v) => v.depth)),
      prob: Math.max(...vs.map((v) => v.prob)),
      share: vs.filter((v) => v.depth > 0).length / vs.length,
    };
  }
  styleShapes();
  renderShapeSummary();
}

function clearShapeResults() {
  if (!state.shapes) return;
  state.shapes.items.forEach((it) => { it.res = null; });
  styleShapes();
  $('#shapesBox').hidden = true;
}

function renderShapeSummary() {
  const sh = state.shapes;
  const inside = sh.items.filter((it) => !it.res.outside);
  const wet = inside.filter((it) => it.res.depth > 0);
  const dangerous = (it) => severity(it.res.depth).label === 'Dangerous';
  $('#shapesBox').hidden = false;
  $('#shapesTitle').textContent = sh.name;
  stats($('#shapeStats'), [
    ['Features checked', fmtInt(inside.length) + (inside.length < sh.items.length ? ` of ${fmtInt(sh.items.length)}` : '')],
    ['Flooded', fmtInt(wet.length)],
    ['Dangerous depth', fmtInt(wet.filter(dangerous).length)],
    ['Highest chance', `${Math.round(Math.max(0, ...inside.map((it) => it.res.prob)) * 100)}%`],
  ]);
  const list = $('#shapeList');
  list.innerHTML = '';
  for (const it of [...wet].sort((a, b) => b.res.depth - a.res.depth).slice(0, 60)) {
    const li = document.createElement('li');
    li.className = dangerous(it) ? 'hot' : '';
    li.innerHTML = `<span>${esc(it.name)}</span><span>${Math.round(it.res.prob * 100)}% · ${fmt(it.res.depth, 1)} m</span>`;
    li.addEventListener('click', () => {
      if (isPoint(it) && it.layer.getLatLng) map.setView(it.layer.getLatLng(), Math.max(map.getZoom(), 15));
      else fitArea(it.layer.getBounds(), 16);
      it.layer.openPopup();
    });
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
  const far = zoomedFarOut();
  const on = (k) => !far && $(`[data-layer=${k}]`).checked;
  const view = $('input[name=floodView]:checked').value;
  if (state.aoiRect) {
    if (far && map.hasLayer(state.aoiRect)) state.aoiRect.remove();
    if (!far && !map.hasLayer(state.aoiRect)) state.aoiRect.addTo(map);
  }
  if (far) hideTip();
  const want = {
    hill: on('hill'), hand: on('hand'), streams: on('streams'), exposure: on('exposure'),
    shapes: $('[data-layer=shapes]').checked, // the user's own data stays visible at any zoom
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
  if (!ex) return toast('Find exposed buildings first.', 'notice');
  const rows = [['osm_id', 'kind', 'name', 'lat', 'lon', 'depth_m', 'probability']];
  for (const f of ex.feats) rows.push([f.id, f.kind, `"${(f.name || '').replace(/"/g, '""')}"`, f.lat.toFixed(6), f.lon.toFixed(6), f.depth.toFixed(2), f.prob.toFixed(3)]);
  download('flood_depth_exposure.csv', rows.map((r) => r.join(',')).join('\n'), 'text/csv');
});

$('#expShapes').addEventListener('click', () => {
  const sh = state.shapes;
  if (!sh) return;
  download('flood_depth_shapes.geojson', JSON.stringify({
    type: 'FeatureCollection',
    features: sh.items.map(({ f, res }) => ({
      ...f,
      properties: {
        ...f.properties,
        flood_depth_m: res && !res.outside ? +res.depth.toFixed(2) : null,
        flood_prob: res && !res.outside ? +res.prob.toFixed(3) : null,
        flooded_share: res && !res.outside ? +res.share.toFixed(3) : null,
      },
    })),
  }), 'application/geo+json');
});

$('#btnMethod').addEventListener('click', () => $('#method').showModal());

// Console access for power users: floodDepth.state.analysis, floodDepth.map, …
window.floodDepth = { map, state };
