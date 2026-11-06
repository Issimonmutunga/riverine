// Tips: what to do about floods where you are.
// In the flood zone it is safety first (get out, and what to do if caught in water);
// elsewhere it is adaptation, matched to the kind of place (riverside or upland, city or farm).
import { lang } from './i18n.js';

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

// ---------- Content, by language ----------
const T = {
  en: {
    terrain: { riverside: 'Right by the river', floodplain: 'On the floodplain', raised: 'Raised ground', upland: 'Upland or slope' },
    settle: { urban: 'City', town: 'Town', rural: 'Rural' },
    measures: (s) => `${s} measures`, yourLand: 'Your land',
    dangerKick: (deep) => (deep ? 'Dangerous water at your location' : 'You are in the flood zone'),
    dangerHead: (deep) => (deep ? 'Get to safety now' : 'Move to higher ground'),
    depthHere: (d) => `About ${d} m of water here`, edge: 'You are at the flood edge',
    chance: (p) => `, ${p}% chance of flooding`, inScenario: ' in the scenario you set.',
    routeHead: 'Safe route', showRoute: 'Show route', noDry: 'No dry ground found nearby',
    noDryText: 'Go up: the highest floor or roof of a strong building, and call for help.',
    getOut: 'Get out safely', caught: 'If you are caught in the water', everCaught: 'If you are ever caught in floodwater',
    dangerFoot: 'Follow instructions from emergency services first. These are general safety tips, based on Red Cross and weather-service guidance.',
    readyKick: 'Flood warning nearby', readyHead: 'Get ready', readyDefault: 'Rain or high river levels are forecast near you.',
    before: 'Before the water comes', openBag: 'Open the grab bag checklist',
    adaptKick: 'Living with floods', adaptHead: 'Adapt your area',
    notLocated: (w) => `Advice for <b>${w}</b>. Turn on your location to check whether you are in the flood zone.`,
    dry: (w) => `Your location stays dry in the scenario you set. Here is how <b>${w}</b> can adapt.`,
    out: (w) => `You are outside the analysed area. Here is general advice for <b>${w}</b>.`,
    none: (w) => `Analyze an area that includes you to check your flood risk. Meanwhile, advice for <b>${w}</b>.`,
    thisArea: 'this area', checkMe: 'Check my location', household: 'Every household',
    tune: 'Analyze the terrain here and Tips will tune the advice to how high you sit above the river.',
    adaptFoot: 'General guidance. Check local building rules and your met service’s advice.',
    GET_OUT: [
      ['Leave now, don’t wait', 'Water can rise fast, especially at night. Go to higher ground before roads close. Take people, medicines, phone and ID; leave the rest.'],
      ['Walk the high route', 'Use roads and bridges that are clear of water. Avoid river crossings, culverts and low bridges.'],
      ['Switch off power and gas', 'Only if it is safe and the floor is dry. Never touch switches while standing in water.'],
      ['Tell someone', 'Let family or neighbours know where you are going. Help children, older people and anyone with a disability first.'],
    ],
    IN_WATER: [
      ['15 cm can knock you over', 'Moving water at ankle height can sweep you off your feet; 30 cm floats a car; 60 cm carries most vehicles away. Turn around, don’t drown.'],
      ['If you are swept away', 'Float on your back with your feet pointing downstream and up near the surface, to push off rocks and debris. Don’t try to stand in fast water: feet get trapped.'],
      ['Swim across, not against', 'Never fight the current. Swim at an angle across it toward the bank or anything solid, and let the water carry you as you go.'],
      ['Grab anything that floats', 'A jerrycan, plank, cooler or ball keeps your head up. Hold on and wait for rescue if you can’t reach the bank.'],
      ['Trapped indoors', 'Go to the highest floor or the roof, not a closed attic. Signal with a bright cloth, torch or phone light. Call for help.'],
      ['In a car with water rising', 'Unbuckle, open the window, and get out onto the roof. A car can float away in 30 cm of moving water.'],
      ['Helping someone else', 'Reach with a stick or rope, or throw something that floats. Don’t go in after them unless you are trained.'],
      ['After the water', 'Floodwater carries sewage, snakes and live wires. Wash with clean water, boil drinking water, and stay out of damaged buildings.'],
    ],
    READY: [
      ['Know your way to high ground', 'Pick the nearest high, safe place and two ways to get there. Walk it once in daylight.'],
      ['Pack a grab bag', 'Water, food for 3 days, torch, radio, phone power bank, medicines, cash, and ID and land papers in a sealed plastic bag.'],
      ['Move things up', 'Lift seed, grain, electronics and documents onto shelves or a raised platform. Move livestock to higher ground early.'],
      ['Stay tuned', 'Follow the met service and local radio. If you are told to leave, leave.'],
    ],
    TERRAIN: {
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
    },
    SETTLE: {
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
    },
    ALWAYS: [
      ['Make a family plan', 'Agree where to meet, who collects the children, and a contact outside the area.'],
      ['Get warnings early', 'Sign up for SMS or radio alerts from your met service, and keep this map’s location alerts on during the rains.'],
    ],
  },

  sw: {
    terrain: { riverside: 'Kando ya mto', floodplain: 'Kwenye uwanda wa mafuriko', raised: 'Ardhi iliyoinuka', upland: 'Nyanda za juu au mteremko' },
    settle: { urban: 'Mjini', town: 'Mji mdogo', rural: 'Vijijini' },
    measures: (s) => `Hatua za ${s.toLowerCase()}`, yourLand: 'Ardhi yako',
    dangerKick: (deep) => (deep ? 'Maji hatari mahali ulipo' : 'Uko katika eneo la mafuriko'),
    dangerHead: (deep) => (deep ? 'Nenda mahali salama sasa' : 'Hamia ardhi ya juu'),
    depthHere: (d) => `Takriban mita ${d} za maji hapa`, edge: 'Uko ukingoni mwa mafuriko',
    chance: (p) => `, uwezekano wa ${p}% wa mafuriko`, inScenario: ' katika hali uliyoweka.',
    routeHead: 'Njia salama', showRoute: 'Onyesha njia', noDry: 'Hakuna ardhi kavu karibu',
    noDryText: 'Panda juu: ghorofa ya juu kabisa au paa la jengo imara, na uombe msaada.',
    getOut: 'Toka kwa usalama', caught: 'Ukinaswa ndani ya maji', everCaught: 'Ukiwahi kunaswa na maji ya mafuriko',
    dangerFoot: 'Fuata maagizo ya huduma za dharura kwanza. Hivi ni vidokezo vya jumla vya usalama, kutoka mwongozo wa Msalaba Mwekundu na huduma za hali ya hewa.',
    readyKick: 'Tahadhari ya mafuriko karibu', readyHead: 'Jitayarishe', readyDefault: 'Mvua au mto kujaa vinatabiriwa karibu nawe.',
    before: 'Kabla maji hayajafika', openBag: 'Fungua orodha ya begi la dharura',
    adaptKick: 'Kuishi na mafuriko', adaptHead: 'Linda eneo lako',
    notLocated: (w) => `Ushauri kwa <b>${w}</b>. Washa mahali ulipo ili kuangalia kama uko katika eneo la mafuriko.`,
    dry: (w) => `Mahali ulipo panabaki pakavu katika hali uliyoweka. Hivi ndivyo <b>${w}</b> inavyoweza kujiandaa.`,
    out: (w) => `Uko nje ya eneo lililochanganuliwa. Huu ni ushauri wa jumla kwa <b>${w}</b>.`,
    none: (w) => `Changanua eneo linalokujumuisha ili kuangalia hatari yako ya mafuriko. Kwa sasa, ushauri kwa <b>${w}</b>.`,
    thisArea: 'eneo hili', checkMe: 'Angalia mahali nilipo', household: 'Kila kaya',
    tune: 'Changanua ardhi hapa na Vidokezo vitalinganisha ushauri na urefu wako juu ya mto.',
    adaptFoot: 'Mwongozo wa jumla. Angalia sheria za ujenzi za eneo lako na ushauri wa idara ya hali ya hewa.',
    GET_OUT: [
      ['Ondoka sasa, usisubiri', 'Maji yanaweza kupanda haraka, hasa usiku. Nenda ardhi ya juu kabla barabara hazijafungwa. Chukua watu, dawa, simu na kitambulisho; acha vingine.'],
      ['Pita njia ya juu', 'Tumia barabara na madaraja yasiyo na maji. Epuka vivuko vya mto, makalavati na madaraja ya chini.'],
      ['Zima umeme na gesi', 'Ikiwa tu ni salama na sakafu ni kavu. Usiguse swichi ukiwa umesimama ndani ya maji.'],
      ['Mjulishe mtu', 'Waambie familia au majirani unakoenda. Wasaidie watoto, wazee na watu wenye ulemavu kwanza.'],
    ],
    IN_WATER: [
      ['Sentimita 15 zinaweza kukuangusha', 'Maji yanayotiririka hadi kifundo cha mguu yanaweza kukusomba; sentimita 30 huelea gari; sentimita 60 husomba magari mengi. Rudi nyuma, usizame.'],
      ['Ukisombwa na maji', 'Elea chali, miguu ikielekea mto unakoenda na karibu na uso wa maji, ili kujikinga na mawe na takataka. Usijaribu kusimama katika maji yaendayo kasi: miguu hunaswa.'],
      ['Ogelea kuvuka, si kupinga', 'Usipigane na mkondo. Ogelea kwa mshazari kuelekea ukingoni au kitu imara, na acha maji yakubebe unapoenda.'],
      ['Shika chochote kinachoelea', 'Mtungi, ubao, kibaridi au mpira hukuweka juu. Shikilia na usubiri uokoaji kama huwezi kufika ukingoni.'],
      ['Ukinaswa ndani ya nyumba', 'Panda ghorofa ya juu kabisa au paa, si dari iliyofungwa. Ashiria kwa kitambaa chenye rangi angavu, tochi au mwanga wa simu. Omba msaada.'],
      ['Ndani ya gari maji yakipanda', 'Fungua mkanda, fungua dirisha, na upande juu ya paa. Gari linaweza kuelea katika sentimita 30 za maji yanayotiririka.'],
      ['Kumsaidia mwingine', 'Mfikie kwa fimbo au kamba, au mrushie kitu kinachoelea. Usiingie majini kumfuata isipokuwa umefunzwa.'],
      ['Baada ya maji', 'Maji ya mafuriko hubeba maji taka, nyoka na nyaya za umeme. Oga kwa maji safi, chemsha maji ya kunywa, na kaa mbali na majengo yaliyoharibika.'],
    ],
    READY: [
      ['Jua njia ya kwenda juu', 'Chagua mahali pa juu na salama palipo karibu na njia mbili za kufika huko. Itembee mara moja mchana.'],
      ['Funga begi la dharura', 'Maji, chakula cha siku 3, tochi, redio, power bank, dawa, pesa, na vitambulisho na hati za ardhi kwenye mfuko wa plastiki uliofungwa.'],
      ['Pandisha vitu juu', 'Weka mbegu, nafaka, vifaa vya umeme na nyaraka kwenye rafu au jukwaa lililoinuliwa. Hamisha mifugo kwenda ardhi ya juu mapema.'],
      ['Sikiliza habari', 'Fuatilia idara ya hali ya hewa na redio ya eneo lako. Ukiambiwa uondoke, ondoka.'],
    ],
    TERRAIN: {
      riverside: [
        ['Kaa mbali na ukingo', 'Usijenge wala kulima kwenye ukingo wa mto. Nchi nyingi zina hifadhi ya kingo za mto (Kenya ni mita 6 hadi 30 kutoka alama ya maji ya juu) ambayo mto huirudia wakati wa mafuriko.'],
        ['Inua sakafu', 'Jenga juu ya msingi ulioinuliwa au nguzo, juu ya alama ya mafuriko ya juu kabisa unayokumbuka wewe au majirani, pamoja na nafasi ya ziada.'],
        ['Shikilia kingo', 'Panda nyasi zenye mizizi mirefu (vetiver), mianzi au miti ya asili kando ya mto ili kupunguza mmomonyoko na kushikilia udongo.'],
        ['Hifadhi chakula juu', 'Weka nafaka na mbegu katika ghala zilizoinuliwa au mapipa yaliyofungwa juu ya kiwango cha mafuriko.'],
      ],
      floodplain: [
        ['Inua vitu muhimu', 'Weka nyumba, vyoo, visima na ghala juu ya misingi iliyoinuliwa ili viendelee kutumika maji yakienea uwandani.'],
        ['Lima pamoja na mafuriko', 'Chagua mbegu za muda mfupi au zinazostahimili mafuriko na upande baada ya msimu mkuu wa mafuriko. Kilimo cha baada ya mafuriko hutumia unyevu ulioachwa.'],
        ['Panga mahali pa kukimbilia', 'Kubalianeni kama jamii kuhusu kilima kilichoinuliwa, shule au kanisa ambapo watu na mifugo wanaweza kusubiri mafuriko yapite.'],
        ['Linda kisima', 'Inua midomo ya visima na jenga vyoo imara ili maji ya mafuriko yasichafue maji ya kunywa.'],
      ],
      raised: [
        ['Angalia sehemu za chini', 'Uko juu ya mto, lakini barabara, shule au mashamba ya karibu huenda sivyo. Jua njia zipi hukatika kwanza.'],
        ['Vuna mvua yako', 'Mifereji ya paa kuelekea tanki, au bwawa dogo, huhifadhi maji kwa kiangazi na hupunguza maji yanayotiririka mteremkoni.'],
        ['Kuwa kimbilio', 'Ardhi ya juu kama yako ndiko majirani hukimbilia wakati wa mafuriko. Kubalianeni mapema watu na mifugo watakapojihifadhi.'],
      ],
      upland: [
        ['Punguza kasi ya maji', 'Matuta, mitaro ya kontua, mashimo ya zai na mistari ya nyasi hushikilia mvua mteremkoni ili iingie ardhini badala ya kukimbilia watu walio chini.'],
        ['Panda miti na funika ardhi', 'Funika miteremko kwa miti, nyasi au matandazo. Udongo mtupu husombwa na kujaza mito matope.'],
        ['Jihadhari na maporomoko', 'Baada ya siku za mvua kubwa, angalia nyufa, miti inayoinama au chemchemi zenye matope kwenye miteremko. Ondoka ukiziona.'],
        ['Ziba makorongo', 'Vizuizi vidogo vya mawe au vijiti katika makorongo madogo hupunguza kasi ya maji na kuyazuia yasipanuke.'],
      ],
    },
    SETTLE: {
      urban: [
        ['Safisha mitaro', 'Mitaro iliyoziba husababisha mafuriko mengi mijini. Weka mtaro ulio mbele ya kiwanja chako bila taka, na ripoti makalavati yaliyoziba.'],
        ['Acha maji yazame', 'Badilisha saruji kwa changarawe, nyasi au vigae vinavyopitisha maji inapowezekana. Bustani ya mvua au shimo la kunyonya maji hupunguza maji barabarani.'],
        ['Linda nyumba dhidi ya mafuriko', 'Inua soketi na mita juu ya kiwango cha mafuriko, weka vali ya kuzuia maji taka kurudi, na uwe na magunia ya mchanga au kizuizi cha mlango.'],
      ],
      town: [
        ['Safisha mitaro', 'Weka mitaro na makalavati ya barabarani wazi kabla ya mvua, na ripoti yaliyoziba kwa kaunti au halmashauri.'],
        ['Jenga juu ya kiwango', 'Majengo mapya yakae juu ya viwango vya mafuriko vinavyojulikana, sakafu ya chini ikiwa juu ya msingi ulioinuliwa.'],
      ],
      rural: [
        ['Vuna maji', 'Matanki ya paa, mabwawa na madimbwi ya shamba huhifadhi mvua kwa kiangazi na hupunguza nguvu ya mafuriko.'],
        ['Gawanya hatari', 'Panda baadhi ya mashamba kwenye ardhi ya juu, weka akiba ya mbegu, na jiunge na kikundi cha akiba au bima ya mazao ikiwa ipo.'],
      ],
    },
    ALWAYS: [
      ['Panga mpango wa familia', 'Kubalianeni mahali pa kukutana, nani atawachukua watoto, na mtu wa kuwasiliana naye nje ya eneo.'],
      ['Pata tahadhari mapema', 'Jisajili kupokea tahadhari kwa SMS au redio kutoka idara ya hali ya hewa, na washa tahadhari za mahali ulipo kwenye ramani hii wakati wa mvua.'],
    ],
  },

  fr: {
    terrain: { riverside: 'Au bord du fleuve', floodplain: 'En plaine inondable', raised: 'Terrain surélevé', upland: 'Hauteurs ou pente' },
    settle: { urban: 'Ville', town: 'Bourg', rural: 'Rural' },
    measures: (s) => `Mesures : ${s.toLowerCase()}`, yourLand: 'Votre terrain',
    dangerKick: (deep) => (deep ? 'Eau dangereuse à votre position' : 'Vous êtes en zone inondée'),
    dangerHead: (deep) => (deep ? 'Mettez-vous en sécurité' : 'Gagnez un terrain plus haut'),
    depthHere: (d) => `Environ ${d} m d’eau ici`, edge: 'Vous êtes en bordure de la crue',
    chance: (p) => `, ${p} % de risque d’inondation`, inScenario: ' dans le scénario choisi.',
    routeHead: 'Itinéraire sûr', showRoute: 'Voir l’itinéraire', noDry: 'Aucun terrain sec à proximité',
    noDryText: 'Montez : dernier étage ou toit d’un bâtiment solide, et appelez à l’aide.',
    getOut: 'Partir en sécurité', caught: 'Si vous êtes pris dans l’eau', everCaught: 'Si vous êtes un jour pris par une crue',
    dangerFoot: 'Suivez d’abord les consignes des secours. Ce sont des conseils généraux, tirés des recommandations de la Croix-Rouge et des services météo.',
    readyKick: 'Alerte crue à proximité', readyHead: 'Préparez-vous', readyDefault: 'De la pluie ou une montée du fleuve est prévue près de chez vous.',
    before: 'Avant l’arrivée de l’eau', openBag: 'Ouvrir la liste du sac d’urgence',
    adaptKick: 'Vivre avec les crues', adaptHead: 'Adapter votre zone',
    notLocated: (w) => `Conseils pour <b>${w}</b>. Activez votre position pour savoir si vous êtes en zone inondée.`,
    dry: (w) => `Votre position reste au sec dans ce scénario. Voici comment <b>${w}</b> peut s’adapter.`,
    out: (w) => `Vous êtes hors de la zone analysée. Voici des conseils généraux pour <b>${w}</b>.`,
    none: (w) => `Analysez une zone qui vous inclut pour connaître votre risque. En attendant, conseils pour <b>${w}</b>.`,
    thisArea: 'cette zone', checkMe: 'Vérifier ma position', household: 'Pour chaque foyer',
    tune: 'Analysez le terrain ici et les conseils s’adapteront à votre hauteur au-dessus du fleuve.',
    adaptFoot: 'Conseils généraux. Vérifiez les règles de construction locales et les avis de votre service météo.',
    GET_OUT: [
      ['Partez maintenant', 'L’eau peut monter vite, surtout la nuit. Gagnez les hauteurs avant que les routes soient coupées. Prenez les personnes, médicaments, téléphone et papiers ; laissez le reste.'],
      ['Prenez le chemin haut', 'Utilisez les routes et ponts hors d’eau. Évitez les gués, les buses et les ponts bas.'],
      ['Coupez électricité et gaz', 'Seulement si c’est sans danger et que le sol est sec. Ne touchez jamais un interrupteur les pieds dans l’eau.'],
      ['Prévenez quelqu’un', 'Dites à votre famille ou vos voisins où vous allez. Aidez d’abord les enfants, les personnes âgées et handicapées.'],
    ],
    IN_WATER: [
      ['15 cm suffisent à vous renverser', 'Une eau courante à hauteur de cheville peut vous emporter ; 30 cm font flotter une voiture ; 60 cm emportent la plupart des véhicules. Faites demi-tour.'],
      ['Si le courant vous emporte', 'Flottez sur le dos, pieds vers l’aval et près de la surface, pour repousser rochers et débris. Ne cherchez pas à vous lever dans un courant rapide : les pieds se coincent.'],
      ['Traversez le courant, sans lutter', 'Ne nagez jamais contre le courant. Nagez en biais vers la rive ou un point solide, en vous laissant porter.'],
      ['Agrippez ce qui flotte', 'Un bidon, une planche, une glacière ou un ballon vous gardent la tête hors de l’eau. Tenez bon et attendez les secours.'],
      ['Bloqué à l’intérieur', 'Montez au dernier étage ou sur le toit, pas dans un grenier fermé. Faites signe avec un tissu vif, une lampe ou l’écran du téléphone. Appelez à l’aide.'],
      ['En voiture, l’eau monte', 'Détachez-vous, ouvrez la fenêtre et montez sur le toit. Une voiture peut être emportée par 30 cm d’eau courante.'],
      ['Aider quelqu’un', 'Tendez un bâton ou une corde, ou lancez un objet qui flotte. N’allez pas dans l’eau sans formation.'],
      ['Après la crue', 'L’eau de crue charrie égouts, serpents et câbles sous tension. Lavez-vous à l’eau propre, faites bouillir l’eau à boire et évitez les bâtiments endommagés.'],
    ],
    READY: [
      ['Connaître le chemin des hauteurs', 'Choisissez le lieu haut et sûr le plus proche et deux façons d’y aller. Faites le trajet une fois de jour.'],
      ['Préparer un sac d’urgence', 'Eau, nourriture pour 3 jours, lampe, radio, batterie externe, médicaments, argent, et papiers d’identité et de terrain dans un sac plastique fermé.'],
      ['Mettre en hauteur', 'Montez semences, grains, appareils et documents sur des étagères ou une plateforme. Déplacez le bétail tôt vers les hauteurs.'],
      ['Restez à l’écoute', 'Suivez le service météo et la radio locale. Si on vous dit de partir, partez.'],
    ],
    TERRAIN: {
      riverside: [
        ['Restez loin de la berge', 'Ne construisez ni ne cultivez sur la berge. Beaucoup de pays fixent une bande riveraine (au Kenya, de 6 à 30 m des plus hautes eaux) que le fleuve reprend en crue.'],
        ['Surélevez le plancher', 'Construisez sur un socle ou des pilotis au-dessus de la plus haute crue dont vous ou vos voisins vous souvenez, avec une marge.'],
        ['Tenez les berges', 'Plantez des herbes à racines profondes (vétiver), du bambou ou des arbres locaux le long de la berge pour freiner l’érosion.'],
        ['Stockez en hauteur', 'Gardez grains et semences dans des greniers surélevés ou des fûts fermés au-dessus du niveau des crues.'],
      ],
      floodplain: [
        ['Surélevez l’essentiel', 'Placez maisons, latrines, puits et greniers sur des socles surélevés pour qu’ils restent utilisables quand l’eau s’étale.'],
        ['Cultivez avec la crue', 'Choisissez des variétés à cycle court ou tolérantes aux crues et semez après la grande crue. La culture de décrue profite du sol humide.'],
        ['Prévoyez un refuge', 'Convenez en communauté d’une butte, d’une école ou d’une église où gens et bétail peuvent attendre la fin de la crue.'],
        ['Protégez le puits', 'Rehaussez les margelles et maçonnez les latrines pour que l’eau de crue ne pollue pas l’eau potable.'],
      ],
      raised: [
        ['Surveillez les points bas', 'Vous êtes au-dessus du fleuve, mais les routes, écoles ou champs voisins peut-être pas. Sachez quels chemins sont coupés en premier.'],
        ['Récoltez la pluie', 'Gouttières vers une citerne ou une petite mare : de l’eau pour la saison sèche et moins de ruissellement vers l’aval.'],
        ['Soyez le refuge', 'Les terrains hauts comme le vôtre accueillent les voisins pendant les crues. Convenez à l’avance où abriter gens et bétail.'],
      ],
      upland: [
        ['Ralentissez l’eau', 'Terrasses, cordons en courbes de niveau, zaï et bandes enherbées retiennent la pluie sur la pente pour qu’elle s’infiltre au lieu de dévaler.'],
        ['Plantez et couvrez', 'Gardez les pentes couvertes d’arbres, d’herbe ou de paillis. Un sol nu part avec l’eau et envase les rivières.'],
        ['Attention aux glissements', 'Après plusieurs jours de forte pluie, guettez fissures, arbres qui penchent ou sources boueuses. Éloignez-vous si vous en voyez.'],
        ['Barrez les ravines', 'De petits seuils de pierres ou de branches dans les ravines ralentissent l’eau et les empêchent de s’agrandir.'],
      ],
    },
    SETTLE: {
      urban: [
        ['Dégagez les caniveaux', 'Les caniveaux bouchés causent la plupart des inondations en ville. Gardez celui devant chez vous propre et signalez les buses bouchées.'],
        ['Laissez l’eau s’infiltrer', 'Remplacez le béton par du gravier, de l’herbe ou des pavés drainants. Un jardin de pluie ou un puisard soulage la rue.'],
        ['Protégez la maison', 'Montez prises et compteurs au-dessus du niveau des crues, posez un clapet anti-retour sur l’égout et gardez des sacs de sable prêts.'],
      ],
      town: [
        ['Dégagez les caniveaux', 'Gardez caniveaux et buses ouverts avant les pluies et signalez ceux qui sont bouchés à la commune.'],
        ['Construisez au-dessus', 'Les nouveaux bâtiments doivent être au-dessus des niveaux de crue connus, rez-de-chaussée sur dalle surélevée.'],
      ],
      rural: [
        ['Récoltez l’eau', 'Citernes, mares et bassins gardent la pluie pour la saison sèche et atténuent les pointes de crue.'],
        ['Répartissez le risque', 'Cultivez quelques champs en hauteur, gardez une réserve de semences et rejoignez une tontine ou une assurance récolte si possible.'],
      ],
    },
    ALWAYS: [
      ['Un plan familial', 'Convenez d’un lieu de rendez-vous, de qui va chercher les enfants et d’un contact hors de la zone.'],
      ['Des alertes tôt', 'Inscrivez-vous aux alertes SMS ou radio du service météo et gardez les alertes de position de cette carte pendant les pluies.'],
    ],
  },
};
const L_ = () => T[lang()] || T.en;

// ---------- Rendering ----------
const list = (items, cls = '') => `<ol class="tip-list ${cls}">${items.map(([t, d]) => `<li><b>${t}</b><span>${d}</span></li>`).join('')}</ol>`;
const section = (title, body, open = true) => `<details class="tip-sec"${open ? ' open' : ''}><summary>${title}</summary>${body}</details>`;

/** All the advice as plain text, for read-aloud. */
export function tipsText(el) { return el.innerText; }

/**
 * Build the Tips pane body.
 * ctx: { mode, located, level, depth, prob, place, terrain, settle, route, calls, warnText, analysed }
 * route: a summary { title, mins, depthLine, deep } when a route was found, 'none' when nothing dry is reachable.
 */
export function renderTips(ctx) {
  const X = L_();
  const { mode, located, terrain, settle } = ctx;
  const where = ctx.place ? esc(ctx.place) : X.thisArea;
  const chips = [terrain && X.terrain[terrain], settle && X.settle[settle]].filter(Boolean)
    .map((t) => `<span class="tip-tag">${t}</span>`).join('');

  if (mode === 'danger') {
    const deep = ctx.level === 'danger';
    let route = '';
    if (ctx.route && ctx.route !== 'none') {
      const r = ctx.route;
      route = `<div class="tip-route">
        <div><b>${esc(r.title)}</b><span>${r.mins} · ${r.depthLine}</span></div>
        <button class="chip" data-act="show-route">${X.showRoute}</button></div>`;
    } else if (ctx.route === 'none') {
      route = `<div class="tip-route"><div><b>${X.noDry}</b><span>${X.noDryText}</span></div></div>`;
    }
    return `
      <div class="tip-hero danger">
        <span class="tip-kicker">${X.dangerKick(deep)}</span>
        <h3>${X.dangerHead(deep)}</h3>
        <p>${ctx.depth > 0 ? X.depthHere(ctx.depth.toFixed(1)) : X.edge}${Number.isFinite(ctx.prob) ? X.chance(Math.round(ctx.prob * 100)) : ''}${X.inScenario}</p>
        ${ctx.calls || ctx.share ? `<div class="tip-calls">${ctx.calls || ''}
          ${ctx.share ? `<button class="share-quick" data-act="share"><svg><use href="#i-shout"/></svg>${esc(ctx.share)}</button>` : ''}</div>` : ''}
      </div>
      ${route}
      ${section(X.getOut, list(X.GET_OUT, 'steps'))}
      ${section(X.caught, list(X.IN_WATER), deep)}
      <p class="tip-foot">${X.dangerFoot}</p>`;
  }

  const terrainTips = X.TERRAIN[terrain || 'floodplain'];
  const settleTips = X.SETTLE[settle || 'rural'];
  const statusLine = !located ? X.notLocated(where)
    : ctx.level === 'dry' ? X.dry(where)
    : ctx.level === 'out' ? X.out(where)
    : X.none(where);
  const ready = mode === 'ready'
    ? `<div class="tip-hero ready"><span class="tip-kicker">${X.readyKick}</span><h3>${X.readyHead}</h3><p>${esc(ctx.warnText || X.readyDefault)}</p>
         <button class="chip tip-bag" data-act="bag"><svg><use href="#i-bag"/></svg>${X.openBag}</button></div>
       ${section(X.before, list(X.READY, 'steps'))}`
    : '';
  const tuneHint = !ctx.analysed ? `<p class="tip-note">${X.tune}</p>` : '';
  return `
    ${ready}
    <div class="tip-hero adapt${mode === 'ready' ? ' slim' : ''}">
      ${mode === 'ready' ? '' : `<span class="tip-kicker">${X.adaptKick}</span><h3>${X.adaptHead}</h3>`}
      <p>${statusLine}</p>
      ${chips ? `<div class="tip-tags">${chips}</div>` : ''}
      ${!located ? `<button class="chip tip-locate" data-act="locate"><svg><use href="#i-locate"/></svg>${X.checkMe}</button>` : ''}
    </div>
    ${tuneHint}
    ${section(terrain ? X.terrain[terrain] : X.yourLand, list(terrainTips), mode !== 'ready')}
    ${section(X.measures(X.settle[settle || 'rural']), list(settleTips), mode !== 'ready')}
    ${section(X.household, list(X.ALWAYS), false)}
    ${section(X.everCaught, list(X.IN_WATER), false)}
    <p class="tip-foot">${X.adaptFoot}</p>`;
}

/** Header words for the Tips pane. */
export function tipsHeader(mode, located) {
  const H = {
    en: { danger: 'Safety first', ready: 'Get ready', adapt: 'Adaptation', me: 'Your location', view: 'Area in view', listen: 'Read aloud' },
    sw: { danger: 'Usalama kwanza', ready: 'Jitayarishe', adapt: 'Kujiandaa', me: 'Mahali ulipo', view: 'Eneo linaloonekana', listen: 'Soma kwa sauti' },
    fr: { danger: 'Sécurité d’abord', ready: 'Préparez-vous', adapt: 'Adaptation', me: 'Votre position', view: 'Zone affichée', listen: 'Lire à voix haute' },
  }[lang()] || {};
  return { mode: H[mode], where: located ? H.me : H.view, listen: H.listen };
}
