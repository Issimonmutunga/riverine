// Tips: what to do about floods where you are.
// In the flood zone it is safety first (get out, and what to do if caught in water);
// elsewhere it is adaptation, matched to the kind of place (riverside or upland, city or farm).

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Which advice applies. `level` comes from the location check; `warn` is any flood warning near the place. */
export function tipsMode({ level, warn }) {
  if (level === 'danger' || level === 'wet') return 'danger';
  if (warn) return 'ready';
  return 'adapt';
}

/** Terrain class from height above the nearest river channel (HAND, metres). */
export function terrainOf(hand) {
  if (!Number.isFinite(hand)) return null;
  if (hand < 3) return 'riverside';
  if (hand < 10) return 'floodplain';
  if (hand < 30) return 'raised';
  return 'upland';
}

/** Settlement class from a Nominatim reverse-geocode address. */
// In some countries (Kenya among them) OSM puts ward names in `city`, so a village wins over `city`.
export function settlementOf(a = {}) {
  if (a.village || a.hamlet || a.isolated_dwelling || a.farm) return 'rural';
  if (a.suburb || a.city_district || a.neighbourhood || a.city_block || a.quarter) return 'urban';
  if (a.town) return 'town';
  if (a.city && !/\bward\b/i.test(a.city)) return 'urban';
  return 'rural';
}
/** The most local place name in a Nominatim address. */
export function placeOf(a = {}) {
  return a.village || a.hamlet || a.suburb || a.town || a.city || a.county || a.state || '';
}

const TERRAIN_LABEL = {
  riverside: 'Right by the river',
  floodplain: 'On the floodplain',
  raised: 'Raised ground',
  upland: 'Upland or slope',
};
const SETTLE_LABEL = { urban: 'City', town: 'Town', rural: 'Rural' };

// ---------- Safety: in the flood zone ----------
const GET_OUT = [
  ['Leave now, don’t wait', 'Water can rise fast, especially at night. Go to higher ground before roads close. Take people, medicines, phone and ID; leave the rest.'],
  ['Walk the high route', 'Use roads and bridges that are clear of water. Avoid river crossings, culverts and low bridges.'],
  ['Switch off power and gas', 'Only if it is safe and the floor is dry. Never touch switches while standing in water.'],
  ['Tell someone', 'Let family or neighbours know where you are going. Help children, older people and anyone with a disability first.'],
];

const IN_WATER = [
  ['15 cm can knock you over', 'Moving water at ankle height can sweep you off your feet; 30 cm floats a car; 60 cm carries most vehicles away. Turn around, don’t drown.'],
  ['If you are swept away', 'Float on your back with your feet pointing downstream and up near the surface, to push off rocks and debris. Don’t try to stand in fast water: feet get trapped.'],
  ['Swim across, not against', 'Never fight the current. Swim at an angle across it toward the bank or anything solid, and let the water carry you as you go.'],
  ['Grab anything that floats', 'A jerrycan, plank, cooler or ball keeps your head up. Hold on and wait for rescue if you can’t reach the bank.'],
  ['Trapped indoors', 'Go to the highest floor or the roof, not a closed attic. Signal with a bright cloth, torch or phone light. Call for help.'],
  ['In a car with water rising', 'Unbuckle, open the window, and get out onto the roof. A car can float away in 30 cm of moving water.'],
  ['Helping someone else', 'Reach with a stick or rope, or throw something that floats. Don’t go in after them unless you are trained.'],
  ['After the water', 'Floodwater carries sewage, snakes and live wires. Wash with clean water, boil drinking water, and stay out of damaged buildings.'],
];

// ---------- Get ready: a warning is near, but you are not in the water ----------
const READY = [
  ['Know your way to high ground', 'Pick the nearest high, safe place and two ways to get there. Walk it once in daylight.'],
  ['Pack a grab bag', 'Water, food for 3 days, torch, radio, phone power bank, medicines, cash, and ID and land papers in a sealed plastic bag.'],
  ['Move things up', 'Lift seed, grain, electronics and documents onto shelves or a raised platform. Move livestock to higher ground early.'],
  ['Stay tuned', 'Follow the met service and local radio. If you are told to leave, leave.'],
];

// ---------- Adaptation, by terrain and settlement ----------
const ADAPT_TERRAIN = {
  riverside: [
    ['Keep back from the bank', 'Don’t build or farm right on the riverbank. Many countries set a riparian reserve (in Kenya 6 to 30 m from the high-water mark) that the river reclaims in floods.'],
    ['Raise the floor', 'Build on a plinth or stilts above the highest flood mark you or your neighbours remember, plus a margin.'],
    ['Bind the banks', 'Plant deep-rooted grass (vetiver), bamboo or native trees along the bank to slow erosion and hold soil.'],
    ['Store food high', 'Keep grain and seed in raised granaries or sealed drums above the flood line.'],
  ],
  floodplain: [
    ['Raise what matters', 'Put homes, latrines, wells and grain stores on raised plinths so they stay usable when water spreads across the plain.'],
    ['Farm with the floods', 'Choose short-season or flood-tolerant varieties and plant after the main flood season. Flood-recession farming uses the wet soil left behind.'],
    ['Plan a refuge', 'Agree as a community on a raised mound, school or church where people and livestock can wait out floods.'],
    ['Seal the well', 'Raise wellheads and line latrines so floodwater can’t pollute drinking water.'],
  ],
  raised: [
    ['Watch the low spots', 'You sit above the river, but roads, schools or fields nearby may not. Know which routes cut off first.'],
    ['Catch your rain', 'Gutters into a tank, or a small water pan, store water for the dry season and send less runoff downhill.'],
    ['Be the refuge', 'Higher ground like yours is where neighbours go in a flood. Agree in advance where people and livestock can shelter.'],
  ],
  upland: [
    ['Slow the water', 'Terraces, contour bunds, zai pits and grass strips hold rain on the slope so it soaks in rather than rushing to people downstream.'],
    ['Plant trees and cover', 'Keep slopes covered with trees, grass or mulch. Bare soil washes away and fills rivers with silt.'],
    ['Mind landslides', 'After days of heavy rain, watch for cracks, tilting trees or muddy springs on slopes. Move away if you see them.'],
    ['Keep gullies clear', 'Check dams of stones or sticks across small gullies slow the flow and stop them growing.'],
  ],
};

const ADAPT_SETTLE = {
  urban: [
    ['Clear the drains', 'Blocked drains cause most city flooding. Keep the drain in front of your plot free of rubbish, and report blocked culverts.'],
    ['Let it soak in', 'Swap concrete for gravel, grass or permeable paving where you can. A rain garden or soak pit takes water off the street.'],
    ['Flood-proof the house', 'Raise sockets and meters above flood height, fit a backflow valve on the sewer, and keep sandbags or a door barrier ready.'],
  ],
  town: [
    ['Clear the drains', 'Keep roadside drains and culverts open before the rains, and report blocked ones to the county or council.'],
    ['Build above the line', 'New buildings should sit above known flood levels, with the ground floor on a raised slab.'],
  ],
  rural: [
    ['Harvest the water', 'Roof tanks, water pans and farm ponds hold rain for the dry season and soften flood peaks.'],
    ['Spread the risk', 'Plant some fields on higher ground, keep a seed reserve, and join a savings group or crop-insurance scheme if one is available.'],
  ],
};

const ALWAYS = [
  ['Make a family plan', 'Agree where to meet, who collects the children, and a contact outside the area.'],
  ['Get warnings early', 'Sign up for SMS or radio alerts from your met service, and keep this map’s location alerts on during the rains.'],
];

// ---------- Rendering ----------
const list = (items, cls = '') => `<ol class="tip-list ${cls}">${items.map(([t, d]) => `<li><b>${t}</b><span>${d}</span></li>`).join('')}</ol>`;
const section = (title, body, open = true) => `<details class="tip-sec"${open ? ' open' : ''}><summary>${title}</summary>${body}</details>`;

function fmtDist(m) {
  return m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}
const DIRS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
function bearing(a, b) {
  const r = Math.PI / 180, y = Math.sin((b.lng - a.lng) * r) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lng - a.lng) * r);
  const deg = (Math.atan2(y, x) / r + 360) % 360;
  return DIRS[Math.round(deg / 45) % 8];
}

/**
 * Build the Tips pane body.
 * ctx: { mode, located, level, depth, prob, place, terrain, settle, safe, me, calls, warnText, analysed }
 */
export function renderTips(ctx) {
  const { mode, located, place, terrain, settle } = ctx;
  const where = place ? esc(place) : 'this area';
  const chips = [terrain && TERRAIN_LABEL[terrain], settle && SETTLE_LABEL[settle]].filter(Boolean)
    .map((t) => `<span class="tip-tag">${t}</span>`).join('');

  if (mode === 'danger') {
    const deep = ctx.level === 'danger';
    let route = '';
    if (ctx.safe) {
      const s = ctx.safe, dir = bearing(ctx.me, { lat: s.lat, lng: s.lon });
      const cross = s.cross > 0.15 ? `<span class="tip-warn">The straight line crosses water up to ${s.cross.toFixed(1)} m deep: find a route around it.</span>` : '';
      route = `<div class="tip-route">
        <div><b>Nearest dry ground: ${fmtDist(s.m)} ${dir}</b>
        <span>As the crow flies, in this scenario. Use roads that are clear of water.</span>${cross}</div>
        <button class="chip" data-act="show-safe">Show on map</button></div>`;
    } else if (ctx.safe === null) {
      route = '<div class="tip-route"><div><b>No dry ground found nearby</b><span>Go up: the highest floor or roof of a strong building, and call for help.</span></div></div>';
    }
    return `
      <div class="tip-hero danger">
        <span class="tip-kicker">${deep ? 'Dangerous water at your location' : 'You are in the flood zone'}</span>
        <h3>${deep ? 'Get to safety now' : 'Move to higher ground'}</h3>
        <p>${ctx.depth > 0 ? `About ${ctx.depth.toFixed(1)} m of water here` : 'You are at the flood edge'}${Number.isFinite(ctx.prob) ? `, ${Math.round(ctx.prob * 100)}% chance of flooding` : ''} in the scenario you set.</p>
        ${ctx.calls ? `<div class="tip-calls">${ctx.calls}</div>` : ''}
      </div>
      ${route}
      ${section('Get out safely', list(GET_OUT, 'steps'))}
      ${section('If you are caught in the water', list(IN_WATER), deep)}
      <p class="tip-foot">Follow instructions from emergency services first. These are general safety tips, based on Red Cross and weather-service guidance.</p>`;
  }

  const terrainTips = terrain ? ADAPT_TERRAIN[terrain] : ADAPT_TERRAIN.floodplain;
  const settleTips = ADAPT_SETTLE[settle || 'rural'];
  const statusLine = !located
    ? `Advice for <b>${where}</b>. Turn on your location to check whether you are in the flood zone.`
    : ctx.level === 'dry' ? `Your location stays dry in the scenario you set. Here is how <b>${where}</b> can adapt.`
    : ctx.level === 'out' ? `You are outside the analysed area. Here is general advice for <b>${where}</b>.`
    : `Analyze an area that includes you to check your flood risk. Meanwhile, advice for <b>${where}</b>.`;
  const ready = mode === 'ready'
    ? `<div class="tip-hero ready"><span class="tip-kicker">Flood warning nearby</span><h3>Get ready</h3><p>${esc(ctx.warnText || 'Rain or high river levels are forecast near you.')}</p></div>
       ${section('Before the water comes', list(READY, 'steps'))}`
    : '';
  const tuneHint = !ctx.analysed
    ? '<p class="tip-note">Analyze the terrain here and Tips will tune the advice to how high you sit above the river.</p>' : '';
  return `
    ${ready}
    <div class="tip-hero adapt${mode === 'ready' ? ' slim' : ''}">
      ${mode === 'ready' ? '' : '<span class="tip-kicker">Living with floods</span><h3>Adapt your area</h3>'}
      <p>${statusLine}</p>
      ${chips ? `<div class="tip-tags">${chips}</div>` : ''}
      ${!located ? '<button class="chip tip-locate" data-act="locate"><svg><use href="#i-locate"/></svg>Check my location</button>' : ''}
    </div>
    ${tuneHint}
    ${section(terrain ? TERRAIN_LABEL[terrain] : 'Your land', list(terrainTips), mode !== 'ready')}
    ${section(`${SETTLE_LABEL[settle || 'rural']} measures`, list(settleTips), mode !== 'ready')}
    ${section('Every household', list(ALWAYS), false)}
    ${section('If you are ever caught in floodwater', list(IN_WATER), false)}
    <p class="tip-foot">General guidance. Check local building rules and your met service’s advice.</p>`;
}
