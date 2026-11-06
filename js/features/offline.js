// Offline: registers the service worker, keeps one saved area (its box, flood settings and terrain tiles)
// and reopens it with no signal. Rivers from OpenStreetMap are kept by app.js alongside.
import { addTool } from '../rail.js';
import { t } from '../i18n.js';
import * as G from '../geo.js';

const KEY = 'floodDepth.offlineArea';
const TERRARIUM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';
const ICON = '<svg><use href="#i-offline"/></svg>';

export function initOffline(ctx) {
  const { state, esc } = ctx;
  const st = { sw: 'sw' in navigator ? 'pending' : 'none', tiles: null, install: null };
  const saved = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };

  if ('serviceWorker' in navigator && isSecureContext) {
    navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready).then(() => {
      st.sw = 'ready';
      tool.refresh();
    }).catch((err) => { console.warn('Offline mode unavailable:', err); st.sw = 'none'; });
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data?.type === 'count') { st.tiles = e.data.n; tool.refresh(); }
    });
  } else st.sw = 'none';
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); st.install = e; tool.refresh(); });
  addEventListener('online', () => tool.refresh());
  addEventListener('offline', () => tool.refresh());

  function askCount() { navigator.serviceWorker?.controller?.postMessage({ type: 'count' }); }

  /** Fetch the terrain tiles of the analysed grid so the service worker stores them. */
  async function keepTerrain(g) {
    const { z, bounds: b } = g;
    const x0 = Math.floor(G.lonToPx(b.w, z) / 256), x1 = Math.floor(G.lonToPx(b.e, z) / 256);
    const y0 = Math.floor(G.latToPx(b.n, z) / 256), y1 = Math.floor(G.latToPx(b.s, z) / 256);
    const urls = [];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) urls.push(`${TERRARIUM}/${z}/${x}/${y}.png`);
    await Promise.allSettled(urls.slice(0, 400).map((u) => fetch(u, { mode: 'cors' })));
  }

  async function saveArea() {
    const g = state.analysis?.grid;
    if (!g || !state.aoi) return ctx.toast(t('offNeedArea'), 'notice');
    const name = ctx.areaName() || `${state.aoi.getCenter().lat.toFixed(2)}, ${state.aoi.getCenter().lng.toFixed(2)}`;
    const b = state.aoi;
    const rec = { name, aoi: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], ui: ctx.uiSettings(), savedAt: Date.now() };
    try { localStorage.setItem(KEY, JSON.stringify(rec)); } catch { /* storage full */ }
    await keepTerrain(g);
    ctx.toast(t('offSavedOk'), 'info');
    askCount();
    tool.refresh();
  }
  function openSaved() {
    const rec = saved();
    if (!rec) return;
    const [w, s, e, n] = rec.aoi;
    ctx.applyUiSettings(rec.ui);
    ctx.openArea(L.latLngBounds([s, w], [n, e]), true);
    if (ctx.isPhone()) tool.btn.click();
  }

  function render(body) {
    const rec = saved();
    const app = st.sw === 'ready' ? `<li class="ok">${t('offApp')}</li>` : st.sw === 'none' ? `<li class="bad">${t('offAppNone')}</li>` : `<li>${t('offAppNo')}</li>`;
    body.innerHTML = `<p class="side-note">${t('offIntro')}</p>
      <ul class="side-status">${app}
        <li class="${navigator.onLine ? 'ok' : 'warn'}">${t(navigator.onLine ? 'offOnline' : 'offOffline')}</li>
        ${st.tiles != null ? `<li>${t('offTiles', { n: st.tiles.toLocaleString() })}</li>` : ''}</ul>
      <p class="side-foot">${t('offTilesHint')}</p>
      ${rec ? `<div class="side-hero"><h3>${t('offSaved', { name: esc(rec.name) })}</h3>
        <p>${new Date(rec.savedAt).toLocaleDateString()}</p>
        <div class="side-btns"><button class="chip go" data-act="open">${t('offOpen')}</button><button class="chip" data-act="forget">${t('offForget')}</button></div></div>` : ''}
      <div class="side-btns"><button class="chip" data-act="save" ${state.analysis ? '' : 'disabled'}><svg><use href="#i-down"/></svg>${t('offSave')}</button>
      ${st.install ? `<button class="chip" data-act="install">${t('offInstall')}</button>` : ''}</div>`;
  }

  const tool = addTool({ id: 'offline', icon: ICON, render, onOpen: askCount });
  tool.body.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'save') saveArea();
    else if (act === 'open') openSaved();
    else if (act === 'forget') { try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ } tool.refresh(); }
    else if (act === 'install' && st.install) { st.install.prompt(); st.install = null; tool.refresh(); }
  });
  ctx.bus.addEventListener('analysis', () => tool.refresh());
  tool.badge(navigator.onLine ? '' : 'warn');
  addEventListener('online', () => tool.badge(''));
  addEventListener('offline', () => tool.badge('warn'));

  // Opened with no signal and an area saved: say where it is.
  if (!navigator.onLine && saved()) setTimeout(() => ctx.toast(t('offIsOffline'), 'notice', 9000), 1200);
}
