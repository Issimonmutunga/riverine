// The extra tools, tucked behind a "more" button in the right-hand map controls.
// "more" opens a small frosted tray of tool tiles; a tile opens that tool's pane beside the buttons,
// where the News and Tips panes open too.
import { t, onLang, speak, stopSpeak, isSpeaking, canSpeak, languages, lang } from './i18n.js';

const wrap = document.getElementById('rail');
const moreBtn = document.getElementById('btnMore');
const tray = Object.assign(document.createElement('div'), { className: 'tool-tray', id: 'toolTray', hidden: true });
tray.setAttribute('role', 'menu');
moreBtn.parentElement.append(tray); // the tray opens beside "more"; panes open at the top of the column
L.DomEvent.disableClickPropagation(wrap);
L.DomEvent.disableScrollPropagation(wrap);
const tools = new Map();
let openId = null, hooks = { onOpen() {} };

/** hooks.onOpen(): called when the tray or a tool opens, so the other right-hand panes can close. */
export function setupRail(h) { hooks = { ...hooks, ...h }; }

/**
 * Add a tool. `icon` is SVG markup; `render(body, tool)` fills the pane each time it opens or refreshes;
 * `text()` optionally gives what read-aloud says (defaults to the pane's text).
 */
export function addTool(spec) {
  const id = spec.id;
  const item = document.createElement('div');
  item.className = `rail-item tool-${id}`;
  item.innerHTML = `<button class="rail-btn" type="button" role="menuitem" aria-controls="pane-${id}">${spec.icon}<span></span></button>`;
  const holder = document.createElement('div');
  holder.innerHTML = `
    <section class="side-pop tool-${id}" id="pane-${id}" role="dialog" hidden>
      <div class="side-inner">
        <header class="masthead">
          <div class="side-acts">
            ${canSpeak ? '<button class="icon speak" type="button"><svg><use href="#i-speak"/></svg></button>' : ''}
            <button class="icon close" type="button"><svg><use href="#i-close"/></svg></button>
          </div>
          <h2></h2>
        </header>
        <div class="side-body"></div>
      </div>
    </section>`;
  const pane = holder.firstElementChild;
  tray.append(item);
  wrap.append(pane);
  const tool = {
    ...spec, item,
    btn: item.querySelector('.rail-btn'),
    pane,
    body: pane.querySelector('.side-body'),
    get open() { return openId === id; },
    refresh() { if (openId === id) return spec.render(tool.body, tool); },
    badge(state) { tool.btn.dataset.state = state || ''; syncMore(); },
  };
  tools.set(id, tool);
  tool.btn.addEventListener('click', (e) => { e.stopPropagation(); toggleTool(id); });
  pane.querySelector('.close').addEventListener('click', () => closeTools());
  pane.querySelector('.speak')?.addEventListener('click', (e) => {
    const b = e.currentTarget;
    if (isSpeaking()) { stopSpeak(); b.classList.remove('on'); return; }
    const said = speak(spec.text?.() ?? tool.body.innerText, () => b.classList.remove('on'));
    if (said) b.classList.add('on');
    if (said === 'novoice') hooks.toast?.(t('noVoice', { lang: languages[lang()] }), 'notice');
  });
  label(tool);
  return tool;
}

function label(tool) {
  tool.btn.querySelector('span').textContent = t(`rail.${tool.id}`);
  tool.btn.title = t(`title.${tool.id}`);
  tool.btn.setAttribute('aria-label', t(`title.${tool.id}`));
  tool.pane.setAttribute('aria-label', t(`title.${tool.id}`));
  tool.pane.querySelector('h2').textContent = t(`title.${tool.id}`);
  tool.pane.querySelector('.close').setAttribute('aria-label', t('close'));
  const sp = tool.pane.querySelector('.speak');
  if (sp) { sp.setAttribute('aria-label', t('listen')); sp.title = t('listen'); }
}

// ---------- The tray ----------
function setTray(open) {
  tray.hidden = !open;
  syncMore();
  if (open) hooks.onOpen();
}
/** "more" mirrors what is inside: expanded while the tray or a tool is open, and a dot when a tool needs attention. */
function syncMore() {
  moreBtn.setAttribute('aria-expanded', !tray.hidden || !!openId);
  const states = [...tools.values()].map((x) => x.btn.dataset.state);
  moreBtn.dataset.state = states.includes('danger') ? 'danger' : states.includes('warn') ? 'warn' : '';
}
moreBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (openId) closeTools();
  else setTray(tray.hidden);
});
document.addEventListener('click', (e) => { if (!tray.hidden && !e.target.closest('#rail')) setTray(false); });

// ---------- Panes ----------
export function toggleTool(id, open = openId !== id) {
  if (open) openTool(id); else closeTools();
}
export function openTool(id) {
  if (openId && openId !== id) closeTools();
  const tool = tools.get(id);
  if (!tool) return;
  tray.hidden = true;
  openId = id;
  tool.pane.hidden = false;
  syncMore();
  hooks.onOpen(id);
  tool.render(tool.body, tool);
  tool.onOpen?.(tool);
}
/** Close whatever is open behind "more": a tool pane or the tray. */
export function closeTools() {
  if (!tray.hidden) { tray.hidden = true; syncMore(); }
  if (!openId) return;
  const tool = tools.get(openId);
  openId = null;
  tool.pane.hidden = true;
  tool.pane.querySelector('.speak')?.classList.remove('on');
  stopSpeak();
  syncMore();
  tool.onClose?.(tool);
  hooks.onClose?.();
}
export const getTool = (id) => tools.get(id);
export const anyToolOpen = () => !!openId;

onLang(() => tools.forEach((tool) => { label(tool); tool.refresh(); }));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeTools(); });
