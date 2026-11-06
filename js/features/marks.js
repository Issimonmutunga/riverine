// Flood marks: people record how high past floods reached. Marks are kept on the device, sent to the
// Google Sheet when one is connected (Saved places), and can set the water level to match them:
// at a mark, the river stage that explains it is the ground's height above the river plus the water depth.
import { addTool, openTool, closeTools } from '../rail.js';
import { t, lang } from '../i18n.js';

const KEY = 'floodDepth.marks';
const ICON = '<svg><use href="#i-mark"/></svg>';

export function initMarks(ctx) {
  const { map, state, esc, fmt } = ctx;
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
  const store = (list) => {
    try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch { return false; }
  };
  let draft = null, layer = null;

  function draw() {
    layer?.remove();
    const marks = load();
    if (!marks.length) { layer = null; return; }
    layer = L.layerGroup(marks.map((m) => L.marker([m.lat, m.lon], {
      icon: L.divIcon({ className: 'mark-pin', html: `<b>${fmt(m.depth, 1)} m</b>`, iconSize: null, iconAnchor: [0, 30] }),
      keyboard: false,
    }).bindPopup(() => `<div class="pop"><h4>${t('title.marks')}</h4>
      <div class="hero"><strong>${fmt(m.depth, 1)} m</strong><span class="badge" style="background:#1f5fa8">${esc(m.date || '')}</span></div>
      ${m.note ? `<p>${esc(m.note)}</p>` : ''}${m.photo ? `<img class="mark-photo" src="${m.photo}" alt="">` : ''}</div>`))).addTo(map);
  }

  // Photos are shrunk to a small JPEG so they fit in the browser's storage.
  function shrink(file) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, 480 / Math.max(img.width, img.height));
        const cv = Object.assign(document.createElement('canvas'), { width: Math.round(img.width * s), height: Math.round(img.height * s) });
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(img.src);
        resolve(cv.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = () => resolve(null);
      img.src = URL.createObjectURL(file);
    });
  }

  function startAt(ll) {
    draft = { lat: ll.lat, lon: ll.lng, depth: 1, date: new Date().toISOString().slice(0, 10), note: '', photo: null };
    openTool('marks');
  }
  function pick() {
    map.getContainer().classList.add('aoi-drawing');
    ctx.toast(t('markTap'), 'info', 5000);
    if (ctx.isPhone()) closeTools();
    map.once('click', (e) => { map.getContainer().classList.remove('aoi-drawing'); startAt(e.latlng); });
  }

  async function save(body) {
    draft.depth = Math.max(0, +body.querySelector('#markDepth').value || 0);
    draft.date = body.querySelector('#markDate').value;
    draft.note = body.querySelector('#markNote').value.trim();
    const file = body.querySelector('#markPhoto').files[0];
    if (file) draft.photo = await shrink(file);
    const m = { id: `${Date.now()}`, ...draft };
    const list = [m, ...load()];
    if (!store(list)) { delete m.photo; store([m, ...load()]); }
    // Also to the Google Sheet, when one is connected.
    const url = ctx.getScriptUrl();
    if (url) {
      fetch(url, { method: 'POST', body: new URLSearchParams({
        type: 'mark', name: `Flood mark ${fmt(m.depth, 1)} m`, bbox: `${m.lon},${m.lat},${m.lon},${m.lat}`,
        note: `${m.depth} m on ${m.date}${m.note ? `: ${m.note}` : ''}`, savedAt: new Date().toISOString(),
      }) }).catch(() => {});
      ctx.toast(t('synced'), 'info', 2500);
    }
    draft = null;
    draw();
    tool.refresh();
  }

  /** Set the water level from the marks inside the analysed area (median of the stages they imply). */
  async function fit() {
    const marks = load();
    if (!state.analysis || !marks.length) return;
    const { values } = await ctx.call({ type: 'sample', points: marks.map((m) => [m.lat, m.lon]) });
    const stages = values.map((v, i) => (v && Number.isFinite(v.hand) ? v.hand + marks[i].depth : null)).filter((x) => x != null).sort((a, b) => a - b);
    if (!stages.length) return ctx.toast(t('fitNone'), 'notice');
    const mid = stages[Math.floor(stages.length / 2)];
    const s = Math.min(15, Math.max(0, Math.round(mid * 10) / 10));
    ctx.useScenario({ mode: 'stage', stage: s });
    ctx.toast(t('fitDone', { s: `${fmt(s, 1)} m`, n: stages.length }), 'info', 6000);
  }

  function render(body) {
    const marks = load();
    if (draft) {
      body.innerHTML = `<form class="mark-form">
        <label class="field"><span>${t('markDepth')}</span><input type="number" id="markDepth" min="0" max="15" step="0.1" value="${draft.depth}"></label>
        <label class="field"><span>${t('markDate')}</span><input type="date" id="markDate" value="${draft.date}"></label>
        <label class="field"><span>${t('markNote')}</span><input type="text" id="markNote" maxlength="140"></label>
        <label class="field"><span>${t('markPhoto')}</span><input type="file" id="markPhoto" accept="image/*" capture="environment"></label>
        <div class="side-btns"><button class="chip go" type="submit">${t('save')}</button><button class="chip" type="button" data-act="cancel">${t('cancel')}</button></div>
      </form>`;
      body.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); save(body); });
      return;
    }
    const dateFmt = (d) => (d ? new Date(`${d}T12:00`).toLocaleDateString(lang(), { day: 'numeric', month: 'short', year: 'numeric' }) : '');
    body.innerHTML = `<p class="side-note">${t('marksIntro')}</p>
      <div class="side-btns"><button class="chip go" data-act="add"><svg><use href="#i-pin"/></svg>${t('addMark')}</button>
      ${ctx.me.latlng ? `<button class="chip" data-act="here"><svg><use href="#i-locate"/></svg>${t('markHere')}</button>` : ''}</div>
      ${marks.length ? `<ul class="side-list">${marks.map((m) => `<li data-id="${m.id}">
        ${m.photo ? `<img src="${m.photo}" alt="">` : '<i class="mark-dot"></i>'}
        <div><b>${fmt(m.depth, 1)} m</b><span>${esc(dateFmt(m.date))}${m.note ? ` · ${esc(m.note)}` : ''}</span></div>
        <button class="icon del" data-act="del" aria-label="Delete"><svg><use href="#i-trash"/></svg></button></li>`).join('')}</ul>
        ${state.analysis ? `<div class="side-btns"><button class="chip" data-act="fit">${t('fitMarks')}</button></div>` : ''}`
        : `<p class="side-foot">${t('noMarks')}</p>`}`;
  }

  const tool = addTool({ id: 'marks', icon: ICON, render, onClose() { draft = null; } });
  tool.body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    const act = b?.dataset.act;
    if (act === 'add') pick();
    else if (act === 'here' && ctx.me.latlng) startAt(ctx.me.latlng);
    else if (act === 'cancel') { draft = null; tool.refresh(); }
    else if (act === 'fit') fit();
    else if (act === 'del') {
      const id = b.closest('li').dataset.id;
      store(load().filter((m) => m.id !== id));
      draw(); tool.refresh();
    } else if (e.target.closest('li[data-id]')) {
      const m = load().find((x) => x.id === e.target.closest('li').dataset.id);
      if (m) map.setView([m.lat, m.lon], Math.max(map.getZoom(), 16));
    }
  });
  ctx.bus.addEventListener('analysis', () => tool.refresh());
  draw();
}
