// Past floods: how often satellites have seen water at each spot since 1984
// (JRC Global Surface Water occurrence, free tiles). Pale = water now and then; deep blue = always water.
import { addTool } from '../rail.js';
import { t } from '../i18n.js';

const URL_TILES = 'https://storage.googleapis.com/global-surface-water/tiles2021/occurrence/{z}/{x}/{y}.png';
const ICON = '<svg><use href="#i-history"/></svg>';

export function initPast(ctx) {
  const { map } = ctx;
  let opacity = 0.8;
  const layer = L.tileLayer(URL_TILES, {
    pane: 'rasters', zIndex: 205, maxNativeZoom: 13, maxZoom: 19, opacity, crossOrigin: true,
    attribution: 'Surface water © <a href="https://global-surface-water.appspot.com">EC JRC / Google</a>',
  });
  const on = () => map.hasLayer(layer);

  function render(body) {
    body.innerHTML = `<p class="side-note">${t('pastIntro')}</p>
      <label class="toggle"><span>${t('pastShow')}</span><input type="checkbox" class="switch" data-act="toggle" ${on() ? 'checked' : ''}></label>
      <div class="past-ramp" aria-hidden="true"></div>
      <div class="past-ticks"><span>${t('pastRarely')}</span><span>${t('pastAlways')}</span></div>
      <label class="field slider"><span>${t('opacity')} <output>${Math.round(opacity * 100)}%</output></span>
        <input type="range" min="0.2" max="1" step="0.05" value="${opacity}" data-act="opacity"></label>
      <p class="side-foot">${t('pastCheck')}</p>`;
  }
  const tool = addTool({ id: 'past', icon: ICON, render });
  function set(show) {
    if (show) layer.addTo(map); else layer.remove();
    tool.btn.classList.toggle('on', show);
  }
  tool.body.addEventListener('change', (e) => { if (e.target.dataset.act === 'toggle') set(e.target.checked); });
  tool.body.addEventListener('input', (e) => {
    if (e.target.dataset.act !== 'opacity') return;
    opacity = +e.target.value;
    layer.setOpacity(opacity);
    e.target.closest('label').querySelector('output').textContent = `${Math.round(opacity * 100)}%`;
  });
  // Opening the pane the first time turns the layer on: that is almost always why it was opened.
  let first = true;
  tool.onOpen = () => { if (first) { first = false; set(true); tool.refresh(); } };
}
