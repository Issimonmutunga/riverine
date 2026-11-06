// Data in and out, in the main panel:
//  · Sharper elevation data: finer free tiles, OpenTopography downloads (free key), or a survey request.
//  · Share: the analysis as one zip (GeoTIFFs, GeoJSON, CSV, README) through the share sheet or a download.
//  · A shared catalogue of dataset links for the area, kept in the team's Google Sheet.
import { CONFIG } from './config.js';
import { zip } from './zip.js';

const $ = (s, el = document) => el.querySelector(s);
const OT_KEY = 'floodDepth.otKey';
const OT = {
  COP30: { api: 'globaldem', label: 'Copernicus GLO-30 · 30 m · global', maxKm2: 450000 },
  NASADEM: { api: 'globaldem', label: 'NASADEM · 30 m · global', maxKm2: 450000 },
  AW3D30: { api: 'globaldem', label: 'ALOS World 3D · 30 m · global', maxKm2: 450000 },
  EU_DTM: { api: 'globaldem', label: 'EU DTM · 30 m bare earth · Europe', maxKm2: 450000 },
  USGS10m: { api: 'usgsdem', label: 'USGS 3DEP · 10 m · USA', maxKm2: 25000 },
  USGS1m: { api: 'usgsdem', label: 'USGS 3DEP LiDAR · 1 m · parts of USA', maxKm2: 250 },
};
const KINDS = { dem: 'Elevation (DEM)', flood: 'Flood map', vector: 'Shapes (GeoJSON / shapefile)', photo: 'Photos', other: 'Other' };

export function initDataHub(ctx) {
  const { state, toast, esc } = ctx;
  const sheetUrl = () => CONFIG.sheetUrl || ctx.getScriptUrl();
  const area = () => state.aoi || ctx.map.getBounds();
  const bboxStr = (b) => [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map((x) => x.toFixed(5)).join(',');
  const km2 = (b) => {
    const lat = b.getCenter().lat;
    return (b.getEast() - b.getWest()) * 111.32 * Math.cos(lat * Math.PI / 180) * (b.getNorth() - b.getSouth()) * 110.57;
  };
  const post = (fields) => fetch(sheetUrl(), { method: 'POST', body: new URLSearchParams(fields) })
    .then((r) => (r.ok ? r.json().catch(() => ({ ok: true })) : Promise.reject(new Error(`HTTP ${r.status}`))));

  // ---------- Sharper elevation data ----------
  for (const [k, d] of Object.entries(OT)) $('#otDataset').append(new Option(d.label, k));
  try { $('#otKey').value = localStorage.getItem(OT_KEY) || ''; } catch { /* storage unavailable */ }
  $('#otKey').addEventListener('change', (e) => { try { localStorage.setItem(OT_KEY, e.target.value.trim()); } catch { /* storage unavailable */ } });

  document.querySelectorAll('[data-detail]').forEach((b) => b.addEventListener('click', () => {
    ctx.setDemSource('global');
    $('#detail').value = b.dataset.detail;
    $('#detail').dispatchEvent(new Event('change'));
    toast(`Detail set to ~${b.dataset.detail === '15' ? 5 : 10} m. Choose an area and tap Analyze terrain.`, 'info');
  }));

  $('#btnOT').addEventListener('click', async () => {
    const status = $('#otStatus');
    const key = $('#otKey').value.trim();
    const ds = $('#otDataset').value, d = OT[ds];
    if (!state.aoi) { status.textContent = 'Choose an area first: search, draw a box or use this view.'; return; }
    if (!key) { status.textContent = 'Paste your OpenTopography API key first (free).'; $('#otKey').focus(); return; }
    const b = state.aoi, size = km2(b);
    if (size > d.maxKm2) { status.textContent = `This area is ${Math.round(size).toLocaleString()} km²; ${ds} allows up to ${d.maxKm2.toLocaleString()} km². Draw a smaller box.`; return; }
    const q = new URLSearchParams({
      [d.api === 'usgsdem' ? 'datasetName' : 'demtype']: ds,
      south: b.getSouth().toFixed(6), north: b.getNorth().toFixed(6), west: b.getWest().toFixed(6), east: b.getEast().toFixed(6),
      outputFormat: 'GTiff', API_Key: key,
    });
    const btn = $('#btnOT');
    btn.disabled = true; btn.textContent = 'Downloading…';
    status.textContent = `Requesting ${d.label.split(' · ')[0]} for ${Math.round(size).toLocaleString()} km² from OpenTopography…`;
    try {
      const res = await fetch(`https://portal.opentopography.org/API/${d.api}?${q}`);
      const type = res.headers.get('content-type') || '';
      if (!res.ok || /xml|text|json|html/.test(type)) {
        const msg = (await res.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
        throw new Error(res.status === 401 ? 'OpenTopography refused the key. Check it is copied in full.'
          : res.status === 204 || /no data/i.test(msg) ? 'No data for this area in that dataset. Try another one, or request a survey below.'
          : msg || `OpenTopography error ${res.status}`);
      }
      const buf = await res.arrayBuffer();
      status.textContent = `Got ${(buf.byteLength / 1e6).toFixed(1)} MB. Loading it as your elevation data…`;
      await ctx.loadDemBuffer(buf, `${ds}_opentopography.tif`);
      status.textContent = `${d.label.split(' · ')[0]} loaded. Tap Analyze terrain.`;
    } catch (err) {
      status.textContent = err.message === 'Failed to fetch' ? 'Couldn’t reach OpenTopography. Check your connection.' : err.message;
    } finally {
      btn.disabled = false; btn.textContent = 'Download for this area';
    }
  });

  // ---------- Survey request ----------
  $('#btnReq').addEventListener('click', () => { $('#reqForm').hidden = !$('#reqForm').hidden; if (!$('#reqForm').hidden) $('#reqName').focus(); });
  $('#reqForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const b = area();
    const f = {
      type: 'demRequest', name: $('#reqName').value.trim(), contact: $('#reqContact').value.trim(), org: $('#reqOrg').value.trim(),
      resolution: $('#reqRes').value, purpose: $('#reqPurpose').value.trim(), area: ctx.areaName() || '', bbox: bboxStr(b),
      savedAt: new Date().toISOString(),
    };
    const status = $('#reqStatus');
    if (sheetUrl()) {
      status.textContent = 'Sending…';
      try {
        await post(f);
        status.textContent = 'Request sent. Thank you: you’ll be contacted on the details you gave.';
        $('#reqForm').reset(); $('#reqForm').hidden = true;
      } catch (err) { status.textContent = `Couldn’t send it (${err.message}). Try again when online.`; }
      return;
    }
    // No Sheet connected: hand it to the email app, filled in.
    const body = [`Area: ${f.area || 'see box'} (${f.bbox}, west,south,east,north)`, `Resolution needed: ${f.resolution}`,
      `Purpose: ${f.purpose}`, '', `From: ${f.name}${f.org ? `, ${f.org}` : ''}`, `Contact: ${f.contact}`].join('\n');
    location.href = `mailto:${CONFIG.requestEmail}?subject=${encodeURIComponent(`Elevation survey request: ${f.area || 'flood area'}`)}&body=${encodeURIComponent(body)}`;
    status.textContent = 'Your email app has the request ready to send.';
  });

  // ---------- Share results ----------
  async function pack() {
    const files = [];
    const exp = async (layer, name) => {
      try { const { buffer } = await ctx.call({ type: 'export', layer }); files.push({ name, data: buffer }); } catch { /* layer not ready */ }
    };
    await exp('dem', 'dem.tif');
    await exp('depth', 'flood_depth.tif');
    await exp('prob', 'flood_probability.tif');
    await exp('hand', 'height_above_river.tif');
    const reaches = ctx.reachesGeoJSON();
    if (reaches) files.push({ name: 'river_reaches.geojson', data: JSON.stringify(reaches) });
    const csv = ctx.exposureCSV();
    if (csv) files.push({ name: 'exposure.csv', data: csv });
    const g = state.analysis.grid, s = state.scenario, ui = ctx.uiSettings();
    const mode = { stage: `water level +${ui.stage} m`, rain: `${ui.p24} mm in 24 h`, flow: `${ui.qref} m³/s at the outlet` }[ui.mode];
    files.push({ name: 'README.txt', data: [
      `Flood Depth results: ${ctx.areaName() || 'analysed area'}`,
      `Made ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC with Flood Depth (${location.origin}${location.pathname})`,
      '',
      `Area (west, south, east, north): ${[g.bounds.w, g.bounds.s, g.bounds.e, g.bounds.n].map((x) => x.toFixed(5)).join(', ')}`,
      `Grid: ${g.W} × ${g.H} cells of about ${Math.round(g.cellM)} m, Web Mercator (EPSG:3857)`,
      `Elevation: ${state.analysis.stats.source}`,
      s ? `Scenario: ${mode}; Manning's n ${ui.manning}; elevation uncertainty ${ui.sigma} m` : 'No flood scenario set.',
      s ? `Flooded area ${s.stats.floodedKm2.toFixed(2)} km², deepest ${s.stats.maxDepth.toFixed(1)} m` : '',
      '',
      'Files: dem.tif (elevation, m) · flood_depth.tif (m) · flood_probability.tif (0–1) · height_above_river.tif (m)',
      '       river_reaches.geojson (rating curves) · exposure.csv (buildings and facilities, if checked)',
      '',
      'A screening tool, not a substitute for hydraulic modelling. Data: AWS Terrain Tiles or your DEM, OpenStreetMap.',
    ].join('\r\n') });
    return files;
  }
  $('#btnSharePack').addEventListener('click', async () => {
    const btn = $('#btnSharePack'), status = $('#packStatus');
    if (!state.analysis) return;
    btn.disabled = true; btn.textContent = 'Packing…';
    try {
      const files = await pack();
      const slug = (ctx.areaName() || 'area').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'area';
      const name = `flood_depth_${slug}.zip`;
      const blob = zip(files);
      const file = new File([blob], name, { type: 'application/zip' });
      const mb = (blob.size / 1e6).toFixed(1);
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: `Flood Depth: ${ctx.areaName() || 'results'}`, text: 'Flood depth, probability and elevation for this area. Open in QGIS or any GIS.' });
          status.textContent = `Shared ${name} (${mb} MB, ${files.length} files).`;
          return;
        } catch (err) { if (err.name === 'AbortError') { status.textContent = ''; return; } }
      }
      ctx.download(name, blob);
      status.textContent = `Downloaded ${name} (${mb} MB, ${files.length} files). Attach it to an email, WhatsApp or a shared drive.`;
    } catch (err) {
      status.textContent = err.message;
    } finally {
      btn.disabled = !state.analysis; btn.textContent = 'Share results';
    }
  });

  // ---------- Shared catalogue ----------
  let catKey = null;
  async function loadCatalogue(force = false) {
    const url = sheetUrl(), list = $('#catList'), hint = $('#catHint');
    $('#btnAddData').disabled = !url;
    if (!url) {
      hint.innerHTML = 'Share links to DEMs, flood maps and shapefiles with your team. Connect a Google Sheet first: tap the <b>bookmark</b> at the top of this panel, then the <b>gear</b>.';
      list.innerHTML = '';
      return;
    }
    const b = area(), key = `${url}|${bboxStr(b)}`;
    if (!force && key === catKey) return;
    catKey = key;
    hint.textContent = 'Looking for datasets shared for this area…';
    try {
      const q = new URLSearchParams({ action: 'list', type: 'dataset', w: b.getWest(), s: b.getSouth(), e: b.getEast(), n: b.getNorth() });
      const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}${q}`);
      const data = await res.json();
      if (catKey !== key) return;
      if (!data.rows) {
        hint.innerHTML = 'Your Sheet’s script is an older version without the catalogue. Update it with <a href="https://github.com/Issimonmutunga/riverine/blob/main/apps-script/Code.gs" target="_blank" rel="noopener">this script ↗</a>.';
        list.innerHTML = '';
        return;
      }
      hint.textContent = data.rows.length ? `${data.rows.length} shared for this area.` : 'Nothing shared for this area yet. Be the first.';
      list.innerHTML = data.rows.map((r, i) => `<li data-i="${i}">
        <span><b>${esc(r.title || r.url)}</b><small>${esc([KINDS[r.kind] || r.kind, r.res, r.licence, r.by && `by ${r.by}`].filter(Boolean).join(' · '))}</small></span>
        <span class="cat-acts">${r.kind === 'dem' || r.kind === 'vector' ? `<button class="chip" data-act="use">Use</button>` : ''}
          <a class="chip" href="${esc(/^https?:/i.test(r.url) ? r.url : '#')}" target="_blank" rel="noopener">Open ↗</a></span></li>`).join('');
      list._rows = data.rows;
    } catch (err) {
      hint.textContent = `Couldn’t load the catalogue (${err.message}).`;
    }
  }
  $('#catList').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act=use]');
    if (!b) return;
    const r = $('#catList')._rows?.[+b.closest('li').dataset.i];
    if (!r) return;
    b.disabled = true; b.textContent = '…';
    try {
      const res = await fetch(r.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      const name = decodeURIComponent(new URL(r.url).pathname.split('/').pop() || r.title || 'dataset');
      if (r.kind === 'dem') await ctx.loadDemBuffer(buf, name);
      else await ctx.loadShapes([new File([buf], /\.\w+$/.test(name) ? name : `${name}.geojson`)]);
    } catch {
      toast('That link can’t be opened from here. Download it with Open, then add it from your files.', 'notice', 7000);
    } finally {
      b.disabled = false; b.textContent = 'Use';
    }
  });
  $('#btnAddData').addEventListener('click', () => { $('#dataForm').hidden = !$('#dataForm').hidden; if (!$('#dataForm').hidden) $('#dataTitle').focus(); });
  $('#dataForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = $('#dataUrl').value.trim();
    if (!/^https?:\/\//i.test(url)) { $('#dataUrl').focus(); return; }
    const f = { type: 'dataset', title: $('#dataTitle').value.trim(), url, kind: $('#dataKind').value, res: $('#dataRes').value.trim(),
      licence: $('#dataLicence').value.trim(), by: $('#dataBy').value.trim(), bbox: bboxStr(area()), savedAt: new Date().toISOString() };
    try {
      await post(f);
      $('#dataForm').reset(); $('#dataForm').hidden = true;
      toast('Dataset link shared with your team.', 'info');
      loadCatalogue(true);
    } catch (err) { toast(`Couldn’t share it (${err.message}).`, 'error'); }
  });
  for (const [k, v] of Object.entries(KINDS)) $('#dataKind').append(new Option(v, k));

  // Keep the catalogue to the area being worked on, loading only while its section is open.
  const section = $('#stepShare');
  const refresh = () => { if (!section.classList.contains('folded')) loadCatalogue(); };
  ctx.bus.addEventListener('area', refresh);
  ctx.bus.addEventListener('analysis', () => { $('#btnSharePack').disabled = !state.analysis; refresh(); });
  new MutationObserver(refresh).observe(section, { attributes: true, attributeFilter: ['class'] });
  ctx.map.on('moveend', () => { if (!state.aoi) refresh(); });
  ctx.bus.addEventListener('sheet', () => loadCatalogue(true));
  loadCatalogue();
}
