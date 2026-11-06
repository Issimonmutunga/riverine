// Share my situation: a ready-to-send message (where I am, how deep, where I'm heading) for WhatsApp,
// SMS or the phone's share sheet, plus a link that opens the same place and flood scenario.
import { addTool } from '../rail.js';
import { t, dist, lang } from '../i18n.js';

// A megaphone shouting: three sound waves radiate from its mouth (animated in CSS).
const ICON = `<svg class="shout" viewBox="0 0 24 24" aria-hidden="true">
  <path d="M3.5 10v4a1 1 0 0 0 1 1H6l6.5 4V5L6 9H4.5a1 1 0 0 0-1 1z"/><path d="M6.5 15l1 4.5h2.2"/>
  <path class="w1" d="M15.5 9.8a3 3 0 0 1 0 4.4"/><path class="w2" d="M17.8 7.6a6.2 6.2 0 0 1 0 8.8"/><path class="w3" d="M20.1 5.4a9.4 9.4 0 0 1 0 13.2"/></svg>`;

// Link state: view, analysis box and scenario settings, kept short.
const LINK_KEYS = { mode: 'm', stage: 's', qref: 'q', qexp: 'b', p24: 'p', runoffC: 'c', cf: 'f', manning: 'n', sigma: 'g', waterLevel: 'w', detail: 'd', danger: 'x' };

export function initShare(ctx) {
  const { map, state, esc } = ctx;
  let msg = '', building = 0;

  async function compose() {
    const gen = ++building;
    const me = ctx.me.latlng;
    const ll = me || map.getCenter();
    const area = await ctx.areaInfo(ll).catch(() => null);
    const place = area?.name || `${ll.lat.toFixed(4)}, ${ll.lng.toFixed(4)}`;
    const lines = [me ? t('msgAt', { place }) : t('msgArea', { place })];
    let v = null;
    if (state.scenario) {
      try { ({ values: [v] } = await ctx.call({ type: 'sample', points: [[ll.lat, ll.lng]] })); } catch { /* outside */ }
    }
    if (v) {
      const d = `${ctx.fmt(v.depth, 1)} m`;
      if (ctx.me.level === 'danger' || (!me && v.depth >= ctx.dangerDepth())) lines.push(t('msgDeep', { d }));
      else if (v.depth > 0.05) lines.push(t('msgWet', { d }));
      else if (v.prob >= 0.05) lines.push(t('msgEdge'));
      else lines.push(t('msgDry'));
    }
    const inDanger = me && (ctx.me.level === 'danger' || ctx.me.level === 'wet');
    if (inDanger && ctx.routeApi) {
      const r = await ctx.routeApi.nearest(me);
      if (r && !r.none) lines.push(t('msgGoing', { name: ctx.routeApi.destName(r), d: dist(r.m) }));
    }
    if (inDanger) lines.push(t('msgNeedHelp'));
    lines.push(`${t('msgMap')}: https://maps.google.com/?q=${ll.lat.toFixed(5)},${ll.lng.toFixed(5)}`);
    lines.push(t('msgTime', { t: new Date().toLocaleString(lang(), { weekday: 'short', hour: '2-digit', minute: '2-digit' }) }));
    if (gen === building) msg = lines.join('\n');
  }

  function link() {
    const c = map.getCenter();
    const p = new URLSearchParams();
    p.set('v', `${c.lat.toFixed(5)},${c.lng.toFixed(5)},${map.getZoom()}`);
    if (state.aoi && !state.upload) {
      const b = state.aoi;
      p.set('a', [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map((x) => x.toFixed(5)).join(','));
      const ui = ctx.uiSettings();
      for (const [k, s] of Object.entries(LINK_KEYS)) if (ui[k] != null) p.set(s, ui[k]);
    }
    return `${location.origin}${location.pathname}#${p}`;
  }

  async function render(body) {
    body.innerHTML = `<p class="side-note">${t('shareIntro')}</p><p class="side-note busy">…</p>`;
    await compose();
    if (!tool.open) return;
    const enc = encodeURIComponent(msg);
    body.innerHTML = `<p class="side-note">${t('shareIntro')}</p>
      ${!ctx.me.latlng ? `<button class="chip" data-act="locate"><svg><use href="#i-locate"/></svg>${t('useLocation')}</button>` : ''}
      <textarea class="share-msg" rows="7" aria-label="${t('title.share')}">${esc(msg)}</textarea>
      <div class="side-btns">
        ${navigator.share ? `<button class="chip go" data-act="send">${t('shareSend')}</button>` : ''}
        <a class="chip wa" href="https://wa.me/?text=${enc}" target="_blank" rel="noopener">${t('shareWhatsApp')}</a>
        <a class="chip" href="sms:?&body=${enc}">${t('shareSms')}</a>
        <button class="chip" data-act="copy"><svg><use href="#i-copy"/></svg>${t('shareCopy')}</button>
      </div>
      <h4 class="side-sub">${t('shareLink')}</h4>
      <p class="side-foot">${t('shareLinkHint')}</p>
      <div class="side-btns"><button class="chip" data-act="link"><svg><use href="#i-copy"/></svg>${t('copyLink')}</button></div>`;
    body.querySelector('.share-msg').addEventListener('input', (e) => {
      msg = e.target.value;
      const en = encodeURIComponent(msg);
      body.querySelector('.wa').href = `https://wa.me/?text=${en}`;
      body.querySelector('a[href^="sms:"]').href = `sms:?&body=${en}`;
    });
  }

  async function copy(text, btn) {
    try { await navigator.clipboard.writeText(text); } catch {
      const ta = Object.assign(document.createElement('textarea'), { value: text });
      document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
    const old = btn.innerHTML;
    btn.textContent = t('copied');
    setTimeout(() => (btn.innerHTML = old), 1500);
  }

  const tool = addTool({ id: 'share', icon: ICON, render, text: () => msg });
  tool.body.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    const act = b?.dataset.act;
    if (act === 'send') { try { await navigator.share({ text: msg }); } catch { /* cancelled */ } }
    else if (act === 'copy') copy(msg, b);
    else if (act === 'link') copy(link(), b);
    else if (act === 'locate') ctx.startLocate();
  });
  ctx.bus.addEventListener('location', () => { if (tool.open && !tool.body.contains(document.activeElement)) tool.refresh(); });
  // The share button pulses when the person is in danger: a nudge to tell someone.
  ctx.bus.addEventListener('location', () => tool.badge(ctx.me.level === 'danger' ? 'danger' : ''));

  // Opening a shared link: go to the place, restore the scenario and analyze it.
  function applyLink() {
    if (!location.hash.includes('v=')) return;
    const p = new URLSearchParams(location.hash.slice(1));
    const [lat, lng, z] = (p.get('v') || '').split(',').map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lng)) map.setView([lat, lng], Number.isFinite(z) ? z : 13);
    const a = (p.get('a') || '').split(',').map(Number);
    if (a.length === 4 && a.every(Number.isFinite)) {
      const ui = {};
      for (const [k, s] of Object.entries(LINK_KEYS)) if (p.has(s)) ui[k] = p.get(s);
      ctx.applyUiSettings(ui);
      ctx.openArea(L.latLngBounds([a[1], a[0]], [a[3], a[2]]), true);
    }
    history.replaceState(null, '', location.pathname + location.search);
  }
  setTimeout(applyLink, 0);
}
