// Share my situation: a ready-to-send message (where I am, how deep, where I'm heading) for WhatsApp,
// SMS or the phone's share sheet; saved emergency contacts who can be texted in one tap from the
// danger alert or Tips; and a link that opens the same place and flood scenario.
import { addTool, openTool } from '../rail.js';
import { t, dist, lang } from '../i18n.js';

// A megaphone shouting: three sound waves radiate from its mouth (animated in CSS).
const ICON = `<svg class="shout" viewBox="0 0 24 24" aria-hidden="true">
  <path d="M3.5 10v4a1 1 0 0 0 1 1H6l6.5 4V5L6 9H4.5a1 1 0 0 0-1 1z"/><path d="M6.5 15l1 4.5h2.2"/>
  <path class="w1" d="M15.5 9.8a3 3 0 0 1 0 4.4"/><path class="w2" d="M17.8 7.6a6.2 6.2 0 0 1 0 8.8"/><path class="w3" d="M20.1 5.4a9.4 9.4 0 0 1 0 13.2"/></svg>`;

// Link state: view, analysis box and scenario settings, kept short.
const LINK_KEYS = { mode: 'm', stage: 's', qref: 'q', qexp: 'b', p24: 'p', runoffC: 'c', cf: 'f', manning: 'n', sigma: 'g', waterLevel: 'w', detail: 'd', danger: 'x' };

// ---------- Emergency contacts (this phone only) ----------
const CKEY = 'floodDepth.contacts';
const MAX_CONTACTS = 6;
const loadContacts = () => { try { return JSON.parse(localStorage.getItem(CKEY)) || []; } catch { return []; } };
const saveContacts = (list) => { try { localStorage.setItem(CKEY, JSON.stringify(list)); } catch { /* storage unavailable */ } };
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const cleanNum = (n) => n.replace(/[^\d+]/g, '');
/** An SMS link with the message filled in, addressed to one or more numbers (iOS and Android differ). */
function smsHref(nums, body) {
  const to = nums.map(cleanNum).filter(Boolean).join(',');
  const b = encodeURIComponent(body);
  if (!to) return `sms:?&body=${b}`;
  if (isIOS) return nums.length > 1 ? `sms:/open?addresses=${to}&body=${b}` : `sms:${to}&body=${b}`;
  return `sms:${to}?body=${b}`;
}
const waHref = (num, body) => `https://wa.me/${num ? num.replace(/\D/g, '') : ''}?text=${encodeURIComponent(body)}`;

export function initShare(ctx) {
  const { map, state, esc } = ctx;
  let msg = '', building = 0, edited = false, composedAt = 0, composedLevel = null, adding = false;

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
    if (gen === building && !edited) {
      msg = lines.join('\n');
      composedAt = Date.now();
      composedLevel = ctx.me.level;
    }
    return msg;
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

  // ---------- Pane ----------
  function contactsHtml() {
    const list = loadContacts();
    const rows = list.map((c, i) => `<li data-i="${i}"><div><b>${esc(c.name || c.num)}</b><span>${esc(c.num)}</span></div>
      <a class="chip" href="${esc(smsHref([c.num], msg))}">${t('shareSms')}</a>
      ${c.num.trim().startsWith('+') ? `<a class="chip wa" href="${esc(waHref(c.num, msg))}" target="_blank" rel="noopener">${t('shareWhatsApp')}</a>` : ''}
      <button class="icon del" data-act="del" aria-label="${t('remove')}" title="${t('remove')}"><svg><use href="#i-trash"/></svg></button></li>`).join('');
    const form = adding ? `<form class="contact-form">
        <input type="text" name="name" placeholder="${t('contactName')}" aria-label="${t('contactName')}" autocomplete="off" maxlength="40">
        <input type="tel" name="num" placeholder="+254 712 345 678" aria-label="${t('contactNum')}" required autocomplete="tel" inputmode="tel">
        <div class="side-btns"><button class="chip go" type="submit">${t('save')}</button><button class="chip" type="button" data-act="cancel-add">${t('cancel')}</button></div>
      </form>` : list.length < MAX_CONTACTS ? `<button class="chip" data-act="add"><svg><use href="#i-pin"/></svg>${t('addContact')}</button>` : '';
    return `<h4 class="side-sub">${t('contacts')}</h4>
      ${list.length ? `<a class="chip text-all" href="${esc(smsHref(list.map((c) => c.num), msg))}"><svg><use href="#i-shout"/></svg>${t('textAll', { n: list.length })}</a>
        <ul class="side-list contacts">${rows}</ul>` : `<p class="side-note">${t('noContacts')}</p>`}
      ${form}
      <p class="side-foot">${t('contactsHint')}</p>`;
  }
  function paintContacts() {
    const box = tool.body.querySelector('.contacts-box');
    if (box) box.innerHTML = contactsHtml();
    box?.querySelector('input[name=name]')?.focus();
  }

  async function render(body) {
    edited = false;
    body.innerHTML = `<p class="side-note">${t('shareIntro')}</p><p class="side-note busy">…</p>`;
    await compose();
    if (!tool.open) return;
    const enc = encodeURIComponent(msg);
    body.innerHTML = `<p class="side-note">${t('shareIntro')}</p>
      ${!ctx.me.latlng ? `<button class="chip" data-act="locate"><svg><use href="#i-locate"/></svg>${t('useLocation')}</button>` : ''}
      <textarea class="share-msg" rows="7" aria-label="${t('title.share')}">${esc(msg)}</textarea>
      <div class="side-btns">
        ${navigator.share ? `<button class="chip go" data-act="send">${t('shareSend')}</button>` : ''}
        <a class="chip wa wa-any" href="https://wa.me/?text=${enc}" target="_blank" rel="noopener">${t('shareWhatsApp')}</a>
        <a class="chip sms-any" href="sms:?&body=${enc}">${t('shareSms')}</a>
        <button class="chip" data-act="copy"><svg><use href="#i-copy"/></svg>${t('shareCopy')}</button>
      </div>
      <div class="contacts-box">${contactsHtml()}</div>
      <h4 class="side-sub">${t('shareLink')}</h4>
      <p class="side-foot">${t('shareLinkHint')}</p>
      <div class="side-btns"><button class="chip" data-act="link"><svg><use href="#i-copy"/></svg>${t('copyLink')}</button></div>`;
    body.querySelector('.share-msg').addEventListener('input', (e) => {
      msg = e.target.value;
      edited = true;
      const en = encodeURIComponent(msg);
      body.querySelector('.wa-any').href = `https://wa.me/?text=${en}`;
      body.querySelector('.sms-any').href = `sms:?&body=${en}`;
      if (!adding) paintContacts();
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

  const tool = addTool({ id: 'share', icon: ICON, render, text: () => msg, onClose() { adding = false; } });
  tool.body.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    const act = b?.dataset.act;
    if (act === 'send') { try { await navigator.share({ text: msg }); } catch { /* cancelled */ } }
    else if (act === 'copy') copy(msg, b);
    else if (act === 'link') copy(link(), b);
    else if (act === 'locate') ctx.startLocate();
    else if (act === 'add') { adding = true; paintContacts(); }
    else if (act === 'cancel-add') { adding = false; paintContacts(); }
    else if (act === 'del') {
      const list = loadContacts();
      list.splice(+b.closest('li').dataset.i, 1);
      saveContacts(list);
      paintContacts();
      ctx.bus.dispatchEvent(new Event('contacts'));
    }
  });
  tool.body.addEventListener('submit', (e) => {
    if (!e.target.matches('.contact-form')) return;
    e.preventDefault();
    const f = new FormData(e.target);
    const num = String(f.get('num') || '').trim();
    if (cleanNum(num).replace('+', '').length < 6) return e.target.querySelector('input[name=num]').focus();
    saveContacts([...loadContacts(), { name: String(f.get('name') || '').trim(), num }].slice(0, MAX_CONTACTS));
    adding = false;
    paintContacts();
    ctx.bus.dispatchEvent(new Event('contacts'));
  });

  // In danger, keep a message ready so one tap can send it straight away.
  ctx.bus.addEventListener('location', () => {
    const lv = ctx.me.level;
    tool.badge(lv === 'danger' ? 'danger' : '');
    if ((lv === 'danger' || lv === 'wet') && !edited && (lv !== composedLevel || Date.now() - composedAt > 60000)) compose();
    if (tool.open && !tool.body.contains(document.activeElement)) tool.refresh();
  });
  ctx.bus.addEventListener('scenario', () => { composedAt = 0; });

  /**
   * One tap from the danger alert or Tips: with saved contacts, open a text to all of them with the
   * situation filled in (they only press send); without contacts, open the Share pane.
   */
  async function quick() {
    const list = loadContacts();
    if (!list.length) { openTool('share'); return; }
    const fresh = msg && Date.now() - composedAt < 60000 && composedLevel === ctx.me.level;
    // The phone only lets a tap open the messaging app for a moment, so don't wait long for a fresh message.
    const m = fresh ? msg : await Promise.race([compose(), new Promise((r) => setTimeout(() => r(msg), 1200))]);
    location.href = smsHref(list.map((c) => c.num), m || msg);
  }
  const quickLabel = () => (loadContacts().length ? t('quickText') : t('quickShare'));

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

  return { quick, quickLabel, open: () => openTool('share') };
}
