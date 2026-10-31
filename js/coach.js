// A light guide on the map: one short tip per step, which fades away once that step is done.
import { setDrawer } from './panel.js';

const STEPS = {
  area: {
    title: 'Pick an area',
    text: 'Search a place, choose an example, draw a box or use your location.',
    acts: [['Draw a box', '#btnDraw'], ['My location', '#btnLocate'], ['Open panel', 'drawer', true]],
  },
  run: {
    title: 'Area set',
    text: 'Analyze the terrain to trace its rivers and low ground. It takes under a minute.',
    acts: [['Analyze terrain', '#btnRun']],
  },
  scenario: {
    title: 'Blue is water depth',
    text: 'Raise the water level in step 2 to try a bigger flood, or switch to rainfall or discharge.',
    acts: [['Open panel', 'drawer', true]],
  },
  explore: {
    title: 'Tap the map',
    text: 'Tap any spot for its flood depth and the chance it floods.',
    acts: [],
  },
  exposure: {
    title: 'Who is affected?',
    text: 'Count the buildings, schools and clinics in the flood, from OpenStreetMap.',
    acts: [['Check buildings', '#btnExposure']],
  },
  done: {
    title: 'You’re set',
    text: 'Flood News has the rain and river outlook. Downloads are at the end of the panel.',
    acts: [],
  },
};
const ORDER = Object.keys(STEPS);
const KEY = 'floodDepth.coach';
const el = document.getElementById('coach');
let at = -1, off = false, timer;
try { off = localStorage.getItem(KEY) === 'done'; } catch { /* storage unavailable */ }

function finish() {
  off = true;
  try { localStorage.setItem(KEY, 'done'); } catch { /* storage unavailable */ }
  fade(() => (el.hidden = true));
}
// Swap or hide with a short fade, so tips come and go without jumping.
function fade(then) {
  clearTimeout(timer);
  if (el.hidden) return then();
  el.classList.add('out');
  timer = setTimeout(() => { el.classList.remove('out'); then(); }, 220);
}

function render() {
  const key = ORDER[at], s = STEPS[key];
  const n = ORDER.length - 1;
  el.innerHTML = `<div class="coach-dots" aria-hidden="true">${ORDER.slice(0, n).map((_, i) => `<i class="${i < at ? 'did' : i === at ? 'now' : ''}"></i>`).join('')}</div>
    <p><b>${s.title}</b> ${s.text}</p>
    ${s.acts.length ? `<div class="coach-acts">${s.acts.map(([label, target, phoneOnly]) => `<button class="chip${phoneOnly ? ' phone-only' : ''}" data-go="${target}">${label}</button>`).join('')}</div>` : ''}
    <button class="icon coach-x" aria-label="Hide tips" title="Hide tips"><svg><use href="#i-close"/></svg></button>`;
  el.hidden = false;
  if (key === 'done') timer = setTimeout(finish, 8000);
}

/** Move the guide on to a step; it only ever goes forward. */
export function coach(step) {
  const i = ORDER.indexOf(step);
  if (off || i <= at) return;
  at = i;
  fade(render);
}
/** While the app works (e.g. analyzing), the tip says so; afterwards the current step comes back. */
export function coachBusy(msg) {
  if (off || at < 0) return;
  fade(msg ? () => {
    el.innerHTML = `<p class="coach-busy"><b>${msg}</b> This takes under a minute.</p>`;
    el.hidden = false;
  } : render);
}
/** Start the tips again from wherever the user is now. */
export function restartCoach(step) {
  try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
  off = false; at = -1;
  coach(step);
}

el.addEventListener('click', (e) => {
  if (e.target.closest('.coach-x')) return finish();
  const go = e.target.closest('[data-go]')?.dataset.go;
  if (go === 'drawer') setDrawer(true);
  else if (go) document.querySelector(go)?.click();
});
