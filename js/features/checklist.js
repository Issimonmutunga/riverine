// Grab bag: what to pack before a flood, ticked off and remembered on this phone.
import { addTool } from '../rail.js';
import { t, lang } from '../i18n.js';

const KEY = 'floodDepth.bag';
const ICON = '<svg><use href="#i-bag"/></svg>';
const ITEMS = [
  ['water', { en: 'Drinking water for 3 days', sw: 'Maji ya kunywa ya siku 3', fr: 'Eau potable pour 3 jours' }],
  ['food', { en: 'Food that keeps, for 3 days', sw: 'Chakula kisichoharibika, cha siku 3', fr: 'Nourriture qui se conserve, pour 3 jours' }],
  ['meds', { en: 'Medicines and prescriptions', sw: 'Dawa na maagizo ya daktari', fr: 'Médicaments et ordonnances' }],
  ['docs', { en: 'ID, land and school papers in a sealed plastic bag', sw: 'Vitambulisho, hati za ardhi na za shule kwenye mfuko wa plastiki uliofungwa', fr: 'Papiers d’identité, de terrain et d’école dans un sac plastique fermé' }],
  ['torch', { en: 'Torch and spare batteries', sw: 'Tochi na betri za ziada', fr: 'Lampe de poche et piles de rechange' }],
  ['power', { en: 'Phone charger and power bank', sw: 'Chaja ya simu na power bank', fr: 'Chargeur de téléphone et batterie externe' }],
  ['radio', { en: 'Small radio for warnings', sw: 'Redio ndogo ya kusikia tahadhari', fr: 'Petite radio pour les alertes' }],
  ['cash', { en: 'Some cash, in small notes', sw: 'Pesa taslimu kidogo, noti ndogo', fr: 'Un peu d’argent liquide, en petites coupures' }],
  ['numbers', { en: 'Family and emergency numbers on paper', sw: 'Namba za familia na za dharura kwenye karatasi', fr: 'Numéros de la famille et d’urgence sur papier' }],
  ['firstaid', { en: 'First-aid kit and soap', sw: 'Sanduku la huduma ya kwanza na sabuni', fr: 'Trousse de premiers secours et savon' }],
  ['whistle', { en: 'Whistle, to call for help', sw: 'Filimbi, ya kuita msaada', fr: 'Sifflet, pour appeler à l’aide' }],
  ['clothes', { en: 'Warm clothes, a blanket and rain cover', sw: 'Nguo za joto, blanketi na kinga ya mvua', fr: 'Vêtements chauds, couverture et protection contre la pluie' }],
  ['care', { en: 'What babies, older people or anyone disabled need', sw: 'Mahitaji ya watoto wachanga, wazee na watu wenye ulemavu', fr: 'Ce dont ont besoin bébés, personnes âgées ou handicapées' }],
  ['animals', { en: 'A plan and a place for livestock', sw: 'Mpango na mahali pa mifugo', fr: 'Un plan et un lieu pour le bétail' }],
];

export function initChecklist(ctx) {
  const load = () => { try { return new Set(JSON.parse(localStorage.getItem(KEY)) || []); } catch { return new Set(); } };
  const store = (s) => { try { localStorage.setItem(KEY, JSON.stringify([...s])); } catch { /* storage unavailable */ } };

  function render(body) {
    const done = load(), n = ITEMS.filter(([k]) => done.has(k)).length;
    const pct = n / ITEMS.length, C = 2 * Math.PI * 18;
    body.innerHTML = `<div class="bag-head">
        <svg class="ring" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="18"/><circle class="val" cx="22" cy="22" r="18"
          stroke-dasharray="${(C * pct).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 22 22)"/></svg>
        <div><b>${t('bagDone', { n, t: ITEMS.length })}</b><p class="side-note">${t('bagIntro')}</p></div></div>
      <ul class="bag-list">${ITEMS.map(([k, tx]) => `<li><label><input type="checkbox" value="${k}" ${done.has(k) ? 'checked' : ''}><span>${tx[lang()] || tx.en}</span></label></li>`).join('')}</ul>
      ${n ? `<div class="side-btns"><button class="chip" data-act="reset">${t('bagReset')}</button></div>` : ''}`;
    tool.badge(n === ITEMS.length ? 'ok' : '');
  }
  const tool = addTool({ id: 'bag', icon: ICON, render,
    text: () => ITEMS.map(([, tx]) => tx[lang()] || tx.en).join('. ') });
  tool.body.addEventListener('change', (e) => {
    if (e.target.type !== 'checkbox') return;
    const s = load();
    if (e.target.checked) s.add(e.target.value); else s.delete(e.target.value);
    store(s);
    render(tool.body);
  });
  tool.body.addEventListener('click', (e) => { if (e.target.closest('[data-act=reset]')) { store(new Set()); render(tool.body); } });
  ctx.openBag = () => tool.btn.click();
}
