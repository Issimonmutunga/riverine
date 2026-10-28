// Panel behaviour: foldable steps, a draggable/collapsible card on desktop, and a snapping bottom sheet on phones.
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
  if (!fold && phone.matches && snap === 'peek') setSnap('half');
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

// ---------------- Phone: bottom sheet with three snap heights ----------------
let snap = 'half', beforePeek = null;
function snaps() {
  return {
    peek: head.offsetHeight + search.offsetHeight + 10 + parseFloat(getComputedStyle(panel).paddingBottom),
    half: Math.round(innerHeight * 0.5),
    full: Math.round(innerHeight * 0.9),
  };
}
export function setSnap(name) {
  snap = name;
  panel.dataset.snap = name;
  if (phone.matches) panel.style.setProperty('--sheet-h', `${snaps()[name]}px`);
  syncToggle();
}
function settle(h, v) {
  const s = snaps();
  const order = ['peek', 'half', 'full'];
  let pick;
  if (v < -0.4) pick = order.find((k) => s[k] > h + 8) || 'full'; // flung up
  else if (v > 0.4) pick = [...order].reverse().find((k) => s[k] < h - 8) || 'peek'; // flung down
  else pick = order.reduce((a, b) => (Math.abs(s[b] - h) < Math.abs(s[a] - h) ? b : a));
  setSnap(pick);
}
const nextSnap = { peek: 'half', half: 'full', full: 'peek' };

/** Get the sheet out of the way (phones only), e.g. while drawing on the map. */
export function peekPanel() {
  if (!phone.matches || snap === 'peek') return;
  beforePeek = snap;
  setSnap('peek');
}
export function restorePanel() {
  if (beforePeek) setSnap(beforePeek);
  beforePeek = null;
}

function syncToggle() {
  const shut = phone.matches ? snap === 'peek' : panel.classList.contains('collapsed');
  panel.classList.toggle('shut', shut);
  toggleBtn.setAttribute('aria-label', shut ? 'Expand panel' : 'Collapse panel');
  toggleBtn.title = shut ? 'Expand' : 'Collapse';
}
toggleBtn.addEventListener('click', () => {
  if (phone.matches) setSnap(snap === 'peek' ? 'half' : 'peek');
  else setCollapsed(!panel.classList.contains('collapsed'));
});
search.querySelector('input').addEventListener('focus', () => { if (phone.matches && snap !== 'full') setSnap('full'); });

// ---------------- Dragging the header ----------------
head.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || e.target.closest('button, a, input, select')) return;
  const start = { x: e.clientX, y: e.clientY, px: panel.offsetLeft, py: panel.offsetTop, h: panel.offsetHeight };
  let moved = false, last = { y: e.clientY, t: e.timeStamp }, v = 0;
  head.setPointerCapture(e.pointerId);
  const move = (ev) => {
    const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
    if (!moved && Math.hypot(dx, dy) < 5) return;
    if (!moved) { moved = true; panel.classList.add('dragging'); }
    if (phone.matches) {
      const dt = ev.timeStamp - last.t;
      if (dt > 0) v = (ev.clientY - last.y) / dt;
      last = { y: ev.clientY, t: ev.timeStamp };
      const s = snaps();
      panel.style.setProperty('--sheet-h', `${clamp(start.h - dy, s.peek, s.full)}px`);
    } else {
      pos = { x: start.px + dx, y: start.py + dy };
      place();
    }
  };
  const up = () => {
    head.removeEventListener('pointermove', move);
    head.removeEventListener('pointerup', up);
    head.removeEventListener('pointercancel', up);
    panel.classList.remove('dragging');
    if (!moved) { if (phone.matches) setSnap(nextSnap[snap]); return; } // a tap on the sheet's header
    if (phone.matches) settle(panel.offsetHeight, v);
    else store.set('pos', pos = { x: panel.offsetLeft, y: panel.offsetTop });
  };
  head.addEventListener('pointermove', move);
  head.addEventListener('pointerup', up);
  head.addEventListener('pointercancel', up);
});
// Double-click the header to put the card back in its corner.
head.addEventListener('dblclick', (e) => {
  if (phone.matches || e.target.closest('button, a')) return;
  pos = null;
  store.set('pos', null);
  place();
});

function layout() {
  place();
  setSnap(snap);
}
addEventListener('resize', layout);
phone.addEventListener('change', layout);
if (store.get('collapsed')) panel.classList.add('collapsed');
layout();
