// Panel behaviour: foldable steps, a draggable/collapsible card on desktop, and a slide-in drawer on phones.
const panel = document.getElementById('panel');
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

// ---------------- Phone: a drawer that slides in from the left ----------------
const pill = document.getElementById('btnDrawer');
let drawerOpen = true, beforePeek = null;
export function setDrawer(open) {
  drawerOpen = open;
  panel.classList.toggle('drawer-closed', !open);
  panel.style.removeProperty('--drawer-x');
  pill.setAttribute('aria-expanded', open);
  syncToggle();
}
/** Get the drawer out of the way (phones only), e.g. while drawing on the map. */
export function peekPanel() {
  if (!phone.matches || !drawerOpen) return;
  beforePeek = true;
  setDrawer(false);
}
export function restorePanel() {
  if (beforePeek) setDrawer(true);
  beforePeek = null;
}
/** Using the map (tap, drag, popup) closes the drawer on phones, like a native side menu. */
export function makeRoomForMap() {
  if (!phone.matches || !drawerOpen) return;
  beforePeek = null;
  setDrawer(false);
}

function syncToggle() {
  const shut = phone.matches ? !drawerOpen : panel.classList.contains('collapsed');
  panel.classList.toggle('shut', shut);
  toggleBtn.setAttribute('aria-label', phone.matches ? 'Close panel' : shut ? 'Expand panel' : 'Collapse panel');
  toggleBtn.title = phone.matches ? 'Close' : shut ? 'Expand' : 'Collapse';
}
toggleBtn.addEventListener('click', () => {
  if (phone.matches) setDrawer(false);
  else setCollapsed(!panel.classList.contains('collapsed'));
});
pill.addEventListener('click', () => setDrawer(true));

// Swiping the drawer to the left closes it; it follows the finger and snaps open or shut.
function dragDrawer(dx) {
  panel.style.setProperty('--drawer-x', `${Math.min(0, dx)}px`);
}
function releaseDrawer(dx, v) {
  panel.classList.remove('dragging');
  setDrawer(!(dx < -panel.offsetWidth / 3 || v < -0.4));
}

// ---------------- Dragging the header ----------------
head.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || e.target.closest('button, a, input, select')) return;
  const start = { x: e.clientX, y: e.clientY, px: panel.offsetLeft, py: panel.offsetTop };
  let moved = false, last = { x: e.clientX, t: e.timeStamp }, v = 0;
  head.setPointerCapture(e.pointerId);
  const move = (ev) => {
    const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
    if (!moved && Math.hypot(dx, dy) < 5) return;
    if (!moved) { moved = true; panel.classList.add('dragging'); }
    if (phone.matches) {
      const dt = ev.timeStamp - last.t;
      if (dt > 0) v = (ev.clientX - last.x) / dt;
      last = { x: ev.clientX, t: ev.timeStamp };
      dragDrawer(dx);
    } else {
      pos = { x: start.px + dx, y: start.py + dy };
      place();
    }
  };
  const up = (ev) => {
    head.removeEventListener('pointermove', move);
    head.removeEventListener('pointerup', up);
    head.removeEventListener('pointercancel', up);
    if (!moved) return;
    if (phone.matches) releaseDrawer(ev.clientX - start.x, v);
    else {
      panel.classList.remove('dragging');
      store.set('pos', pos = { x: panel.offsetLeft, y: panel.offsetTop });
    }
  };
  head.addEventListener('pointermove', move);
  head.addEventListener('pointerup', up);
  head.addEventListener('pointercancel', up);
});
// A clearly sideways swipe anywhere on the drawer's content works too; vertical moves still scroll it.
const scroller = panel.querySelector('.scroll');
let swipe = null;
scroller.addEventListener('touchstart', (e) => {
  if (!phone.matches || e.touches.length !== 1 || e.target.closest('input[type=range], select')) return;
  swipe = { x: e.touches[0].clientX, y: e.touches[0].clientY, active: false, v: 0, last: e.touches[0].clientX, t: e.timeStamp };
}, { passive: true });
scroller.addEventListener('touchmove', (e) => {
  if (!swipe) return;
  const { clientX: x, clientY: y } = e.touches[0];
  const dx = x - swipe.x, dy = y - swipe.y;
  if (!swipe.active) {
    if (Math.hypot(dx, dy) < 8) return;
    if (dx > -8 || Math.abs(dx) < Math.abs(dy) * 1.5) { swipe = null; return; }
    swipe.active = true;
    panel.classList.add('dragging');
  }
  e.preventDefault();
  const dt = e.timeStamp - swipe.t;
  if (dt > 0) swipe.v = (x - swipe.last) / dt;
  swipe.last = x; swipe.t = e.timeStamp;
  dragDrawer(dx);
}, { passive: false });
const endSwipe = () => {
  if (swipe?.active) releaseDrawer(swipe.last - swipe.x, swipe.v);
  swipe = null;
};
scroller.addEventListener('touchend', endSwipe);
scroller.addEventListener('touchcancel', endSwipe);

// Double-click the header to put the card back in its corner.
head.addEventListener('dblclick', (e) => {
  if (phone.matches || e.target.closest('button, a')) return;
  pos = null;
  store.set('pos', null);
  place();
});

function layout() {
  place();
  syncToggle();
}
addEventListener('resize', layout);
phone.addEventListener('change', layout);
if (store.get('collapsed')) panel.classList.add('collapsed');
layout();
