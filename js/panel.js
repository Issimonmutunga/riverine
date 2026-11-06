// Panel behaviour: foldable steps, a draggable/collapsible card on desktop, and a bottom sheet on phones.
// On phones the sheet has three heights, like Google and Apple Maps: peek (search only), half and full.
const panel = document.getElementById('panel');
const app = document.getElementById('app');
const head = panel.querySelector('.brand');
const search = panel.querySelector('.search');
const toggleBtn = document.getElementById('btnSheet');
const phone = matchMedia('(max-width: 820px)');
const GAP = 12;
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(`floodDepth.${k}`)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(`floodDepth.${k}`, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

// ---------------- Foldable steps ----------------
function syncStep(step) {
  const h2 = step.querySelector('h2');
  const locked = step.classList.contains('locked');
  h2.setAttribute('aria-expanded', !locked && !step.classList.contains('folded'));
  h2.setAttribute('aria-disabled', locked);
  h2.tabIndex = locked ? -1 : 0;
}
export function foldStep(step, fold) {
  if (typeof step === 'string') step = document.querySelector(step);
  step.classList.toggle('folded', fold);
}
for (const step of panel.querySelectorAll('.step')) {
  const h2 = step.querySelector('h2'), body = step.querySelector('.body');
  // An inner wrapper lets the body animate its height through a 0fr ↔ 1fr grid row.
  const inner = document.createElement('div');
  inner.className = 'inner';
  inner.append(...body.childNodes);
  body.append(inner);
  h2.setAttribute('role', 'button');
  h2.insertAdjacentHTML('beforeend', '<svg class="fold" aria-hidden="true"><use href="#i-chev"/></svg>');
  h2.addEventListener('click', () => {
    if (!step.classList.contains('locked')) foldStep(step, !step.classList.contains('folded'));
  });
  h2.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); h2.click(); }
  });
  syncStep(step);
  new MutationObserver(() => syncStep(step)).observe(step, { attributes: true, attributeFilter: ['class'] });
}

// ---------------- Desktop: draggable, collapsible card ----------------
let pos = store.get('pos');
function place() {
  if (phone.matches || !pos) {
    panel.style.removeProperty('--px');
    panel.style.removeProperty('--py');
    return;
  }
  const x = clamp(pos.x, GAP, innerWidth - panel.offsetWidth - GAP);
  const y = clamp(pos.y, GAP, innerHeight - head.offsetHeight - GAP);
  panel.style.setProperty('--px', `${x}px`);
  panel.style.setProperty('--py', `${y}px`);
}
function setCollapsed(on) {
  panel.classList.toggle('collapsed', on);
  store.set('collapsed', on);
  syncToggle();
}

// ---------------- Phone: a bottom sheet with three heights ----------------
const ORDER = ['peek', 'half', 'full'];
let sheet = 'peek', beforePeek = null;
const subs = new Set();
const tabbarH = () => document.getElementById('tabbar')?.offsetHeight || 0;
// The notch / status-bar height, measured once with a probe (CSS env() can't be read directly).
const probe = Object.assign(document.createElement('div'), { style: 'position:fixed;top:0;height:env(safe-area-inset-top);visibility:hidden;pointer-events:none' });
document.body.append(probe);
function heights() {
  const room = innerHeight - tabbarH();
  const peek = Math.round(head.offsetHeight + search.offsetHeight + 14);
  return { peek, half: Math.max(peek + 120, Math.round(room * 0.5)), full: Math.round(room - 10 - probe.offsetHeight) };
}
function applySheet(px) {
  panel.style.setProperty('--sheet-h', `${px}px`);
  app.style.setProperty('--sheet-now', `${px}px`);
}
/** Snap the phone sheet to 'peek', 'half' or 'full'. */
export function setSheet(s) {
  sheet = s;
  if (!phone.matches) return;
  const h = heights();
  applySheet(h[s]);
  app.style.setProperty('--sheet-peek', `${h.peek}px`);
  panel.dataset.sheet = s;
  panel.classList.toggle('drawer-closed', s === 'peek');
  if (s === 'peek') panel.querySelector('.scroll').scrollTop = 0;
  syncToggle();
  subs.forEach((fn) => fn(s));
}
export const getSheet = () => sheet;
export const onSheet = (fn) => subs.add(fn);

/** Open (half) or close (peek) the panel; on desktop this is a no-op. */
export function setDrawer(open) {
  if (phone.matches) setSheet(open ? (sheet === 'peek' ? 'half' : sheet) : 'peek');
}
/** Get the sheet out of the way (phones only), e.g. while drawing on the map or reading News. */
export function peekPanel() {
  if (!phone.matches || sheet === 'peek') return;
  beforePeek = sheet;
  setSheet('peek');
}
export function restorePanel() {
  if (beforePeek && phone.matches) setSheet(beforePeek);
  beforePeek = null;
}
/** Using the map (tap, drag, popup) lowers the sheet on phones, like Google Maps. */
export function makeRoomForMap() {
  if (!phone.matches || sheet === 'peek') return;
  beforePeek = null;
  setSheet('peek');
}

function syncToggle() {
  const shut = phone.matches ? sheet === 'peek' : panel.classList.contains('collapsed');
  panel.classList.toggle('shut', shut);
  toggleBtn.setAttribute('aria-label', shut ? 'Expand panel' : 'Collapse panel');
  toggleBtn.title = shut ? 'Expand' : 'Collapse';
}
toggleBtn.addEventListener('click', () => {
  if (phone.matches) setSheet(sheet === 'peek' ? 'half' : 'peek');
  else setCollapsed(!panel.classList.contains('collapsed'));
});
// Tapping the search field brings the whole sheet up, so results show above the keyboard.
search.querySelector('input').addEventListener('focus', () => { if (phone.matches) setSheet('full'); });

// Dragging the sheet: follows the finger, then snaps to the nearest height (or the next one on a flick).
let drag = null;
function startDrag(y) {
  drag = { y, h: panel.offsetHeight, last: y, t: performance.now(), v: 0 };
  panel.classList.add('dragging');
}
function moveDrag(y) {
  const now = performance.now();
  if (now > drag.t) drag.v = (y - drag.last) / (now - drag.t);
  drag.last = y; drag.t = now;
  const h = heights();
  applySheet(clamp(drag.h - (y - drag.y), h.peek, h.full));
}
function endDrag() {
  panel.classList.remove('dragging');
  const h = heights(), cur = panel.offsetHeight;
  let i = ORDER.indexOf(ORDER.reduce((a, b) => (Math.abs(h[b] - cur) < Math.abs(h[a] - cur) ? b : a)));
  if (drag.v < -0.45) i = Math.min(2, ORDER.indexOf(ORDER.find((s) => h[s] > drag.h + 10) || 'full'));
  else if (drag.v > 0.45) i = Math.max(0, ORDER.indexOf([...ORDER].reverse().find((s) => h[s] < drag.h - 10) || 'peek'));
  drag = null;
  beforePeek = null;
  setSheet(ORDER[i]);
}

// ---------------- Dragging the header ----------------
head.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || e.target.closest('button, a, input, select')) return;
  const start = { x: e.clientX, y: e.clientY, px: panel.offsetLeft, py: panel.offsetTop };
  let moved = false;
  head.setPointerCapture(e.pointerId);
  const move = (ev) => {
    const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
    if (!moved && Math.hypot(dx, dy) < 5) return;
    if (!moved) {
      moved = true;
      if (phone.matches) startDrag(start.y); else panel.classList.add('dragging');
    }
    if (phone.matches) moveDrag(ev.clientY);
    else {
      pos = { x: start.px + dx, y: start.py + dy };
      place();
    }
  };
  const up = () => {
    head.removeEventListener('pointermove', move);
    head.removeEventListener('pointerup', up);
    head.removeEventListener('pointercancel', up);
    if (!moved) {
      // A tap on the header opens or lowers the sheet.
      if (phone.matches) setSheet(sheet === 'peek' ? 'half' : 'peek');
      return;
    }
    if (phone.matches) endDrag();
    else {
      panel.classList.remove('dragging');
      store.set('pos', pos = { x: panel.offsetLeft, y: panel.offsetTop });
    }
  };
  head.addEventListener('pointermove', move);
  head.addEventListener('pointerup', up);
  head.addEventListener('pointercancel', up);
});

// The content drags the sheet too: up until it is full, and down once scrolled to the top.
const scroller = panel.querySelector('.scroll');
let touch = null;
scroller.addEventListener('touchstart', (e) => {
  if (!phone.matches || e.touches.length !== 1 || e.target.closest('input[type=range], select, textarea')) return;
  touch = { y: e.touches[0].clientY, x: e.touches[0].clientX, active: false };
}, { passive: true });
scroller.addEventListener('touchmove', (e) => {
  if (!touch) return;
  const { clientX: x, clientY: y } = e.touches[0];
  const dy = y - touch.y, dx = x - touch.x;
  if (!touch.active) {
    if (Math.abs(dy) < 8 || Math.abs(dx) > Math.abs(dy)) return;
    const up = dy < 0;
    if ((up && sheet !== 'full') || (!up && scroller.scrollTop <= 0)) { touch.active = true; startDrag(touch.y); }
    else { touch = null; return; }
  }
  e.preventDefault();
  moveDrag(y);
}, { passive: false });
const endTouch = () => { if (touch?.active) endDrag(); touch = null; };
scroller.addEventListener('touchend', endTouch);
scroller.addEventListener('touchcancel', endTouch);

// Double-click the header to put the card back in its corner.
head.addEventListener('dblclick', (e) => {
  if (phone.matches || e.target.closest('button, a')) return;
  pos = null;
  store.set('pos', null);
  place();
});

function layout() {
  place();
  if (phone.matches) setSheet(sheet);
  else { panel.style.removeProperty('--sheet-h'); delete panel.dataset.sheet; panel.classList.remove('drawer-closed'); }
  syncToggle();
}
addEventListener('resize', layout);
phone.addEventListener('change', layout);
if (store.get('collapsed')) panel.classList.add('collapsed');
// Fonts and the tab bar settle a moment after load, so measure the heights again then.
requestAnimationFrame(layout);
addEventListener('load', layout);
layout();
