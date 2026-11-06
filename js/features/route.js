// Safe route on foot and the nearest safe shelter. Shelters are schools, clinics, places of worship,
// halls and assembly points from OpenStreetMap that stay dry in the current scenario; the route is the
// worker's water-avoiding path to the nearest of them (or to the nearest dry ground).
import { addTool, openTool, closeTools, getTool } from '../rail.js';
import { t, dist, lang, onLang } from '../i18n.js';

const ICON_ROUTE = '<svg><use href="#i-route"/></svg>';
const ICON_SHELTER = '<svg><use href="#i-shelter"/></svg>';
const AMENITY = 'school|college|university|hospital|clinic|community_centre|shelter|place_of_worship|townhall|police|fire_station';
const KIND = {
  en: { school: 'School', college: 'College', university: 'University', hospital: 'Hospital', clinic: 'Clinic', community_centre: 'Community hall', shelter: 'Shelter', place_of_worship: 'Place of worship', townhall: 'Town hall', police: 'Police', fire_station: 'Fire station', assembly_point: 'Assembly point' },
  sw: { school: 'Shule', college: 'Chuo', university: 'Chuo kikuu', hospital: 'Hospitali', clinic: 'Zahanati', community_centre: 'Ukumbi wa jamii', shelter: 'Makazi', place_of_worship: 'Nyumba ya ibada', townhall: 'Ofisi ya mji', police: 'Polisi', fire_station: 'Zimamoto', assembly_point: 'Mahali pa kukusanyika' },
  fr: { school: 'École', college: 'Lycée', university: 'Université', hospital: 'Hôpital', clinic: 'Centre de santé', community_centre: 'Salle communautaire', shelter: 'Abri', place_of_worship: 'Lieu de culte', townhall: 'Mairie', police: 'Police', fire_station: 'Pompiers', assembly_point: 'Point de rassemblement' },
};
const kindName = (k) => KIND[lang()][k] || KIND.en[k] || k.replace(/_/g, ' ');

export function initRoute(ctx) {
  const { map, state, call, esc } = ctx;
  const st = {
    pinLL: null, pinMarker: null, picking: false,
    mode: 'shelter', chosen: null, result: null, msg: null, busy: false,
    raw: null, rawKey: null, shelters: null, shLayer: null, routeLayer: null, cache: new Map(),
  };

  // ---------- Start point ----------
  function startPoint() {
    if (ctx.me.latlng) return { ll: ctx.me.latlng, kind: 'me' };
    if (st.pinLL) return { ll: st.pinLL, kind: 'pin' };
    return null;
  }
  function pickOnMap(then) {
    st.picking = true;
    map.getContainer().classList.add('aoi-drawing');
    ctx.toast(t('pickHint'), 'info', 5000);
    if (ctx.isPhone()) closeTools();
    map.once('click', (e) => {
      st.picking = false;
      map.getContainer().classList.remove('aoi-drawing');
      st.pinLL = e.latlng;
      st.pinMarker?.remove();
      st.pinMarker = L.circleMarker(e.latlng, { radius: 7, color: '#fff', weight: 3, fillColor: '#5856d6', fillOpacity: 1, interactive: false }).addTo(map);
      st.result = null;
      then();
    });
  }

  // ---------- Shelters ----------
  const shelterKey = (ll) => `${ll.lat.toFixed(2)},${ll.lng.toFixed(2)}`;
  const haveShelters = (ll) => st.rawKey === shelterKey(ll) && !!st.raw;
  // One lookup per place at a time; a slow one keeps going in the background and is kept for next time.
  const inflight = new Map();
  function rawShelters(ll) {
    const key = shelterKey(ll);
    if (st.rawKey === key && st.raw) return Promise.resolve(st.raw);
    if (!inflight.has(key)) {
      inflight.set(key, fetchShelters(ll, key).finally(() => inflight.delete(key)));
    }
    return inflight.get(key);
  }
  async function fetchShelters(ll, key) {
    const a = `(around:6000,${ll.lat.toFixed(5)},${ll.lng.toFixed(5)})`;
    const q = `[out:json][timeout:20];(nwr["amenity"~"^(${AMENITY})$"]${a};nwr["emergency"="assembly_point"]${a};);out center tags 400;`;
    const json = await ctx.overpass(q, 15000);
    const seen = new Set();
    st.raw = json.elements.map((e) => {
      const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon, tg = e.tags || {};
      if (lat == null || seen.has(`${e.type}${e.id}`)) return null;
      seen.add(`${e.type}${e.id}`);
      return { id: `${e.type}/${e.id}`, lat, lon, name: tg.name || '', kind: tg.amenity || 'assembly_point' };
    }).filter(Boolean);
    st.rawKey = key;
    return st.raw;
  }
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), ms))]);
  /** Shelters near a point, each checked against the current flood, nearest first. */
  async function shelters(ll, waitMs = 12000) {
    const list = await withTimeout(rawShelters(ll), waitMs);
    if (!list.length) return [];
    let values = [];
    if (state.analysis) ({ values } = await call({ type: 'sample', points: list.map((s) => [s.lat, s.lon]) }));
    return list.map((s, i) => {
      const v = values[i];
      return { ...s, inGrid: !!v, depth: v?.depth ?? null, prob: v?.prob ?? null,
        dry: !!v && !(v.depth > 0) && v.prob < 0.05, km: ll.distanceTo([s.lat, s.lon]) / 1000 };
    }).sort((a, b) => a.km - b.km);
  }

  // ---------- Route ----------
  async function computeRoute(sp, { mode = st.mode, chosen = st.chosen } = {}) {
    let targets = null, cand = [], note = null;
    if (mode === 'shelter' || chosen) {
      try {
        const sh = chosen ? [] : await shelters(sp.ll);
        cand = chosen ? [chosen] : sh.filter((s) => s.dry).slice(0, 40);
        if (!cand.length) note = sh.length ? 'wet' : 'fallback';
      } catch (err) { console.warn('Shelters unavailable:', err); note = 'slow'; }
      if (cand.length) targets = cand.map((s) => [s.lat, s.lon]);
    }
    let res = await call({ type: 'route', start: [sp.ll.lat, sp.ll.lng], targets, maxKm: 8 });
    if (!res.route && targets && res.reason !== 'outside') {
      note = 'fallback';
      res = await call({ type: 'route', start: [sp.ll.lat, sp.ll.lng], targets: null, maxKm: 8 });
    }
    if (!res.route) return { none: res.reason, sp };
    const to = targets && res.route.target >= 0 && note !== 'fallback' ? cand[res.route.target] : null;
    return { ...res.route, to, sp, note };
  }

  /** For Tips and Share: the route from a point to the nearest dry shelter, cached per scenario. */
  // Until shelters are known it answers at once with dry ground, and looks shelters up in the background.
  async function nearest(ll) {
    if (!state.scenario) return null;
    const known = haveShelters(ll);
    const key = `${ll.lat.toFixed(4)},${ll.lng.toFixed(4)}|${ctx.scenarioGen()}|${known}`;
    if (!st.cache.has(key)) {
      st.cache.clear();
      if (!known) rawShelters(ll).then(() => ctx.bus.dispatchEvent(new Event('shelters'))).catch(() => {});
      st.cache.set(key, computeRoute({ ll, kind: 'me' }, { mode: known ? 'shelter' : 'dry', chosen: null }).catch(() => null));
    }
    return st.cache.get(key);
  }

  function minutes(r) { return Math.max(1, Math.round((r.m - r.wetM) / 75 + r.wetM / 30)); }
  function destName(r) { return r.to ? (r.to.name || kindName(r.to.kind)) : t('dryGround'); }

  function drawRoute(r) {
    clearRoute();
    const g = L.layerGroup();
    const pts = r.path.map((p) => [p[0], p[1]]);
    g.addLayer(L.polyline(pts, { color: '#fff', weight: 9, opacity: 0.9, interactive: false, lineCap: 'round', lineJoin: 'round' }));
    g.addLayer(L.polyline(pts, { color: '#248a3d', weight: 5, interactive: false, lineCap: 'round', lineJoin: 'round' }));
    const end = pts[pts.length - 1];
    g.addLayer(L.circleMarker(end, { radius: 10, color: '#fff', weight: 3, fillColor: '#34c759', fillOpacity: 1 })
      .bindTooltip(esc(destName(r)), { direction: 'top', offset: [0, -10], permanent: true, className: 'route-tip' }));
    st.routeLayer = g.addTo(map);
    const b = L.latLngBounds(pts);
    // Frame the route in the map space between the main panel (left) and an open pane (right).
    const pane = getTool('route')?.pane;
    let left = 40, right = 80;
    if (!ctx.isPhone()) {
      left = (document.getElementById('panel')?.getBoundingClientRect().right || 0) + 24;
      if (pane && !pane.hidden) right = innerWidth - pane.getBoundingClientRect().left + 24;
      if (innerWidth - left - right < 220) { left = 40; right = 80; }
    }
    map.fitBounds(b, { paddingTopLeft: [left, 70], paddingBottomRight: [right, 70], maxZoom: 17 });
  }
  function clearRoute() { st.routeLayer?.remove(); st.routeLayer = null; }

  function summary(r) {
    const depthLine = r.maxDepth > 0.05
      ? `${t('deepest', { d: `${ctx.fmt(r.maxDepth, 1)} m` })} · ${t('wetFor', { d: dist(r.wetM) })}`
      : t('allDry');
    return { title: t('walkTo', { d: dist(r.m), name: destName(r) }), mins: t('minutes', { n: minutes(r) }), depthLine, deep: r.maxDepth > 0.5 };
  }

  // ---------- Route pane ----------
  let runGen = 0;
  async function run(tool) {
    const sp = startPoint();
    if (!sp || !state.scenario) return;
    const gen = ++runGen;
    st.busy = true; st.msg = null; st.lookingUp = false;
    render(tool.body);
    const done = (r) => {
      if (gen !== runGen) return false;
      st.result = r;
      if (r.none) st.msg = r.none === 'outside' ? t('outside') : t('noRoute');
      else drawRoute(r);
      return true;
    };
    try {
      // Shelters not known yet: show the way to dry ground at once, then upgrade it if shelters arrive.
      if (st.mode === 'shelter' && !st.chosen && !haveShelters(sp.ll)) {
        const quick = await computeRoute(sp, { mode: 'dry', chosen: null });
        if (!done(quick)) return;
        st.busy = false; st.lookingUp = !quick.none;
        render(tool.body);
        if (quick.none) return;
      }
      const r = await computeRoute(sp);
      if (!done(r)) return;
    } catch (err) { if (gen === runGen) st.msg = err.message; }
    if (gen !== runGen) return;
    st.busy = false; st.lookingUp = false;
    render(tool.body);
  }

  function render(body) {
    const sp = startPoint();
    const from = sp ? t(sp.kind === 'me' ? 'fromMe' : 'fromPin') : null;
    const startRow = `<div class="side-row"><span>${t('startFrom')}: <b>${from || '—'}</b></span>
      <span class="side-btns"><button class="chip" data-act="me"><svg><use href="#i-locate"/></svg>${t('useLocation')}</button>
      <button class="chip" data-act="pick"><svg><use href="#i-pin"/></svg>${t('pickOnMap')}</button></span></div>`;
    const seg = `<div class="seg side-seg"><label><input type="radio" name="routeTo" value="shelter" ${st.mode === 'shelter' && !st.chosen ? 'checked' : ''}> ${t('toShelter')}</label>
      <label><input type="radio" name="routeTo" value="dry" ${st.mode === 'dry' && !st.chosen ? 'checked' : ''}> ${t('toDry')}</label></div>`;
    let out = '';
    if (!state.scenario) out = `<p class="side-note">${t('needScenario')}</p>`;
    else if (!sp) out = '';
    else if (st.busy) out = `<p class="side-note busy">${t('finding')}</p>`;
    else if (st.msg) out = `<p class="side-warn">${esc(st.msg)}</p>`;
    else if (st.result && !st.result.none) {
      const s = summary(st.result), r = st.result;
      const end = r.path[r.path.length - 1];
      out = `<div class="side-hero go">
        <h3>${esc(s.title)}</h3><p>${s.mins}</p><p class="${r.maxDepth > 0.05 ? 'wet' : 'drytxt'}">${s.depthLine}</p>
        ${s.deep ? `<p class="side-warn">${t('deepWarn')}</p>` : ''}
        ${st.lookingUp ? `<p class="side-note busy">${t('loadingShelters')}</p>` : ''}
        ${r.note && !st.lookingUp && st.mode === 'shelter' ? `<p class="side-note">${t({ slow: 'sheltersSlow', wet: 'sheltersWet' }[r.note] || 'noShelters')}</p>` : ''}
        <div class="side-btns"><button class="chip go" data-act="show">${t('showRoute')}</button>
        <a class="chip" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&travelmode=walking&origin=${r.sp.ll.lat.toFixed(5)},${r.sp.ll.lng.toFixed(5)}&destination=${end[0].toFixed(5)},${end[1].toFixed(5)}">${t('openMaps')} ›</a></div>
      </div>`;
    }
    body.innerHTML = `${startRow}${state.scenario ? seg : ''}${out}<p class="side-foot">${t('routeNote')}</p>`;
  }

  const routeTool = addTool({
    id: 'route', icon: ICON_ROUTE,
    render,
    onOpen(tool) { if (!st.result && startPoint() && state.scenario) run(tool); },
  });
  routeTool.body.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'me') { if (ctx.me.latlng) { st.result = null; run(routeTool); } else ctx.startLocate(); }
    else if (act === 'pick') pickOnMap(() => { openTool('route'); run(routeTool); });
    else if (act === 'show' && st.result) { drawRoute(st.result); if (ctx.isPhone()) closeTools(); }
  });
  routeTool.body.addEventListener('change', (e) => {
    if (e.target.name !== 'routeTo') return;
    st.mode = e.target.value; st.chosen = null; st.result = null;
    run(routeTool);
  });

  // ---------- Shelters pane ----------
  async function renderShelters(body) {
    const sp = startPoint();
    const ll = sp?.ll || map.getCenter();
    const from = t(sp ? (sp.kind === 'me' ? 'fromMe' : 'fromPin') : 'fromCentre');
    body.innerHTML = `<p class="side-note">${t('sheltersIntro')}</p><p class="side-note busy">${t('loadingShelters')}</p>`;
    try {
      st.shelters = await shelters(ll, 60000);
    } catch (err) {
      console.warn('Shelters unavailable:', err);
      if (!shelterTool.open) return;
      body.innerHTML = `<p class="side-note">${t('sheltersIntro')}</p><p class="side-warn">${t('sheltersFail')}</p>
        <div class="side-btns"><button class="chip" data-act="retry">${t('retry')}</button></div>`;
      return;
    }
    if (!shelterTool.open) return;
    drawShelters();
    const rows = st.shelters.slice(0, 40).map((s, i) => {
      const status = !s.inGrid ? '' : s.dry ? `<i class="pill ok">${t('dry')}</i>`
        : s.depth > 0.05 ? `<i class="pill bad">${t('flooded', { d: `${ctx.fmt(s.depth, 1)} m` })}</i>`
        : `<i class="pill warn">${t('atRisk', { p: Math.round(s.prob * 100) })}</i>`;
      return `<li data-i="${i}"><div><b>${esc(s.name || kindName(s.kind))}</b><span>${esc(kindName(s.kind))} · ${dist(s.km * 1000)}</span></div>
        ${status}${state.scenario && s.inGrid ? `<button class="chip" data-act="route" data-i="${i}">${t('routeHere')}</button>` : ''}</li>`;
    }).join('');
    body.innerHTML = `<p class="side-note">${t('sheltersIntro')} ${t('sheltersFrom', { from })}</p>
      ${!state.scenario ? `<p class="side-note">${t('needScenario')}</p>` : ''}
      ${rows ? `<ul class="side-list">${rows}</ul>` : `<p class="side-warn">${t('noShelters')}</p>`}`;
  }
  function drawShelters() {
    st.shLayer?.remove();
    const g = L.layerGroup();
    for (const s of st.shelters || []) {
      const color = !s.inGrid ? '#8e8e93' : s.dry ? '#34c759' : '#e0301e';
      g.addLayer(L.circleMarker([s.lat, s.lon], { radius: 6, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 })
        .bindTooltip(esc(s.name || kindName(s.kind)), { direction: 'top', offset: [0, -6] }));
    }
    st.shLayer = g.addTo(map);
  }
  const shelterTool = addTool({
    id: 'shelters', icon: ICON_SHELTER,
    render: renderShelters,
    onClose() { st.shLayer?.remove(); st.shLayer = null; },
  });
  shelterTool.body.addEventListener('click', (e) => {
    if (e.target.closest('[data-act=retry]')) { shelterTool.refresh(); return; }
    const b = e.target.closest('[data-act=route]');
    const li = e.target.closest('li[data-i]');
    const s = st.shelters?.[+(b || li)?.dataset.i];
    if (!s) return;
    if (b) {
      if (!startPoint()) { st.chosen = s; pickOnMap(() => { openTool('route'); run(routeTool); }); return; }
      st.chosen = s; st.result = null;
      openTool('route'); run(routeTool);
    } else map.setView([s.lat, s.lon], Math.max(map.getZoom(), 16));
  });

  // Fresh results whenever the flood or the start point changes.
  ctx.bus.addEventListener('scenario', () => { st.result = null; clearRoute(); if (routeTool.open) run(routeTool); shelterTool.refresh(); });
  ctx.bus.addEventListener('location', () => { if (routeTool.open && !st.result && !st.busy) run(routeTool); });
  onLang(() => { if (st.routeLayer && st.result) drawRoute(st.result); });

  return { nearest, summary, destName, minutes, show(r) { st.result = r; drawRoute(r); }, open() { openTool('route'); } };
}
