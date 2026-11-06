// Flood timeline: the GloFAS river forecast for each of the next 10 days, run as a discharge scenario,
// so people can scrub (or play) through how far the water is expected to spread day by day.
import { addTool } from '../rail.js';
import { t, lang } from '../i18n.js';

const ICON = '<svg><use href="#i-timeline"/></svg>';

export function initTimeline(ctx) {
  const { state, call, fmt, fmtInt } = ctx;
  const st = { key: null, days: null, sel: 0, busy: false, playing: null };

  function forecast() {
    const d = ctx.cond();
    if (!state.analysis || !d?.river) return null;
    const g = state.analysis.grid.bounds;
    const c = L.latLngBounds([g.s, g.w], [g.n, g.e]).getCenter();
    if (d.ll.distanceTo(c) > 40000) return null;
    const r = d.river;
    const q = r.series.slice(r.today, r.today + 10).filter(Number.isFinite);
    return q.length >= 2 ? q : null;
  }
  const dayDate = (k) => { const x = new Date(); x.setDate(x.getDate() + k); return x; };
  const dayName = (k) => dayDate(k).toLocaleDateString(lang(), { weekday: 'short', day: 'numeric', month: 'short' });

  async function build(q) {
    const p = ctx.scenarioParams();
    const key = JSON.stringify([state.analysis.grid.bounds, q, p.n, p.sigma, p.b]);
    if (st.key === key) return;
    st.busy = true; tool.refresh();
    const days = [];
    for (const [k, qk] of q.entries()) {
      const res = await call({ type: 'scenario', mode: 'flow', params: { ...p, Qref: qk } });
      days.push({ k, q: qk, km2: res.stats.floodedKm2 });
    }
    st.days = days; st.key = key; st.busy = false;
    // Start on the worst day: that is the one people need to see.
    st.sel = days.reduce((b, d) => (d.km2 > days[b].km2 ? d.k : b), 0);
    await show(st.sel);
  }
  function show(k) {
    st.sel = k;
    tool.refresh();
    return ctx.useScenario({ mode: 'flow', qref: Math.round(st.days[k].q) });
  }

  function chart() {
    const W = 300, H = 90, n = st.days.length, bw = W / n, top = Math.max(...st.days.map((d) => d.km2), 0.01);
    return `<svg class="tl-chart" viewBox="0 0 ${W} ${H + 18}" role="img" aria-label="${t('title.timeline')}">
      ${st.days.map((d) => {
        const h = Math.max(2, (d.km2 / top) * (H - 6));
        return `<g data-k="${d.k}" class="${d.k === st.sel ? 'sel' : ''}"><title>${dayName(d.k)}: ${fmt(d.km2, 1)} km²</title><rect x="${d.k * bw + 3}" y="${H - h}" width="${bw - 6}" height="${h}" rx="3"/>
          <text x="${d.k * bw + bw / 2}" y="${H + 13}" text-anchor="middle">${dayDate(d.k).toLocaleDateString(lang(), { weekday: 'narrow' })}</text>
          <rect class="hit" x="${d.k * bw}" y="0" width="${bw}" height="${H + 18}"/></g>`;
      }).join('')}</svg>`;
  }

  function render(body) {
    const q = forecast();
    if (!q) { body.innerHTML = `<p class="side-note">${t('tlIntro')}</p><p class="side-warn">${t('tlNeed')}</p>`; return; }
    if (!st.days || st.busy) {
      body.innerHTML = `<p class="side-note">${t('tlIntro')}</p><p class="side-note busy">${t('tlBuilding')}</p>`;
      if (!st.busy) build(q);
      return;
    }
    const d = st.days[st.sel];
    body.innerHTML = `<p class="side-note">${t('tlIntro')}</p>
      <div class="side-hero"><h3>${dayName(d.k)}</h3>
        <p>${t('tlDay', { day: '', q: fmtInt(d.q), a: `${fmt(d.km2, 1)} km²` }).replace(/^\s*[:：]\s*/, '')}</p></div>
      ${chart()}
      <div class="tl-ctl"><button class="chip" data-act="play"><svg><use href="#i-${st.playing ? 'pause' : 'play'}"/></svg>${t(st.playing ? 'pause' : 'play')}</button>
        <input type="range" min="0" max="${st.days.length - 1}" step="1" value="${st.sel}" aria-label="${t('title.timeline')}"></div>
      <p class="side-foot">${t('tlNote')}</p>`;
  }

  function stop() { clearInterval(st.playing); st.playing = null; }
  const tool = addTool({ id: 'timeline', icon: ICON, render, onClose: stop });
  tool.body.addEventListener('click', (e) => {
    const g = e.target.closest('[data-k]');
    if (g) { stop(); show(+g.dataset.k); return; }
    if (e.target.closest('[data-act=play]')) {
      if (st.playing) { stop(); tool.refresh(); return; }
      let k = st.sel >= st.days.length - 1 ? 0 : st.sel;
      show(k);
      st.playing = setInterval(() => {
        k += 1;
        if (k >= st.days.length) { stop(); tool.refresh(); return; }
        show(k);
      }, 1400);
      tool.refresh();
    }
  });
  tool.body.addEventListener('input', (e) => { if (e.target.type === 'range') { stop(); show(+e.target.value); } });
  ctx.bus.addEventListener('conditions', () => { if (tool.open && !st.days) tool.refresh(); });
  ctx.bus.addEventListener('analysis', () => { st.key = null; st.days = null; stop(); });
}
