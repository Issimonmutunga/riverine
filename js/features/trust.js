// "Trust": a plain-language guide to what this app can and cannot tell you, and where its data comes from.
import { addTool } from '../rail.js';

const ICON = '<svg viewBox="0 0 24 24"><path d="M12 3 5 6v5.4c0 4.4 3 7.9 7 9.6 4-1.7 7-5.2 7-9.6V6z"/><path d="m9 12 2.2 2.2L15.5 10"/></svg>';

const GOOD = [
  ['Where water is likely to go', 'It shows low ground, valleys and the paths water follows downhill. These are stable features of the land.'],
  ['Which areas flood first', 'Places close to rivers and lower than the river bank get wet first. The map shows that order well.'],
  ['Comparing two places', 'If one spot is much lower than another, trust that it is more at risk.'],
  ['Getting ready', 'Use it to plan where to go, which way to walk and what to pack, before the rain starts.'],
];
const BAD = [
  ['Exact depths', 'A depth of 1.2 m does not mean 1.2 m. Treat depths as a rough guide, in steps like “ankle, knee, waist, over your head”.'],
  ['A single house or plot', 'The land data is about the size of a football pitch (about 30 m). It cannot see a wall, a ditch or a raised floor.'],
  ['Blocked drains, bridges and dams', 'It cannot see culverts, blocked drains, broken embankments, dam releases or buildings in the way. Real floods can be worse or better than shown.'],
  ['Flash floods and heavy local rain', 'It maps floods from rivers rising. Sudden water running off roofs and roads in a downpour is not included.'],
  ['Being told when to leave', 'It is not an official warning. If the authorities say leave, leave.'],
];
const DATA = [
  ['Ground height', 'AWS Terrain Tiles', 'A world map of ground height built from satellite and survey data (including NASA SRTM). Good on open land, weaker in forest, cities and steep valleys. Heights can be off by several metres.'],
  ['Rivers', 'OpenStreetMap', 'Rivers drawn by volunteers. Small streams may be missing, so the app also works out where water would flow from the ground height alone.'],
  ['Rain forecast', 'Open-Meteo weather models', 'Rain from the last week and the next week. A forecast can be wrong about where and when rain falls.'],
  ['River flow forecast', 'GloFAS (Copernicus), via Open-Meteo', 'Expected river flow for large rivers, on a grid of about 5 km. It can miss small rivers and sudden floods.'],
  ['Past floods', 'JRC Global Surface Water', 'Where satellites saw water between 1984 and 2021. It shows what happened before, not what will happen next.'],
  ['Alerts', 'GDACS and Copernicus flood watch', 'International disaster alerts. They cover big events, not every local flood.'],
  ['Places to go', 'OpenStreetMap', 'Schools, clinics, halls and places of worship that volunteers have mapped. A place may be missing, closed or full. Check before you rely on it.'],
  ['Place names and search', 'OpenStreetMap Nominatim', 'Finds towns and rivers by name.'],
  ['Map pictures', 'OpenStreetMap, OpenTopoMap, Esri, Sentinel-2 cloudless (EOX)', 'The background maps. Satellite pictures can be several years old.'],
];

const li = ([title, text]) => `<li><b>${title}</b><span>${text}</span></li>`;

function render(body) {
  body.innerHTML = `<div class="trust">
    <p class="trust-lead"><b>In short:</b> this app shows where floods are <i>likely</i> to reach. It is a guide to help you get ready. It is <b>not</b> a promise, and it is <b>not</b> an official warning.</p>

    <h3 class="trust-h good"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>You can trust it for</h3>
    <ul class="trust-list good">${GOOD.map(li).join('')}</ul>

    <h3 class="trust-h bad"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>Do not trust it for</h3>
    <ul class="trust-list bad">${BAD.map(li).join('')}</ul>

    <h3 class="trust-h">How sure is it?</h3>
    <p class="side-note">The “chance of flooding” layer shows how sure the app is. A strong colour means the ground there is clearly lower than the water level. A pale colour means the app is unsure, because the ground height could be off by a little. Look at both layers, not only the depth.</p>

    <h3 class="trust-h">Where the data comes from</h3>
    <ul class="trust-data">${DATA.map(([what, who, note]) => `<li><b>${what}</b><em>${who}</em><span>${note}</span></li>`).join('')}</ul>

    <h3 class="trust-h">What to do</h3>
    <ul class="trust-steps">
      <li>Listen to your local weather service and the authorities first.</li>
      <li>If the water is rising and you are unsure, move to higher ground early.</li>
      <li>Never walk or drive through moving water. Even 15 cm can knock you over.</li>
      <li>Ask neighbours and elders. They know where water has reached before.</li>
    </ul>
  </div>`;
}

export function initTrust(ctx) {
  const tool = addTool({ id: 'trust', icon: ICON, render,
    text: () => 'This app shows where floods are likely to reach. It is a guide, not a promise and not an official warning. '
      + 'You can trust it for ' + GOOD.map((g) => g[0]).join(', ') + '. Do not trust it for ' + BAD.map((b) => b[0]).join(', ') + '.' });
  ctx.openTrust = () => tool.btn.click();
}
