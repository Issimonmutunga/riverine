// Languages for the people-facing parts of the app (left tools, Tips, checklist, sharing),
// plus read-aloud through the browser's own speech engine.
const LANGS = { en: 'English', sw: 'Kiswahili', fr: 'Français' };
const VOICE = { en: 'en-GB', sw: 'sw-KE', fr: 'fr-FR' };
const KEY = 'floodDepth.lang';

const S = {
  en: {
    'rail.route': 'Route', 'rail.shelters': 'Shelters', 'rail.offline': 'Offline', 'rail.share': 'Share',
    'rail.marks': 'Marks', 'rail.past': 'Past', 'rail.timeline': '10 days', 'rail.lang': 'Language', 'rail.bag': 'Grab bag',
    'title.route': 'Safe route on foot', 'title.shelters': 'Nearest safe shelter', 'title.offline': 'Works offline',
    'title.share': 'Share my situation', 'title.marks': 'Flood marks', 'title.past': 'Past floods',
    'title.timeline': 'Flood in the next 10 days', 'title.lang': 'Language', 'title.bag': 'Grab bag checklist',
    close: 'Close', listen: 'Read aloud', stop: 'Stop reading',
    needScenario: 'Analyze the terrain and set a flood scenario first: the route needs to know where the water is.',
    needAnalysis: 'Analyze the terrain here first.',
    useLocation: 'Use my location', pickOnMap: 'Tap the map', pickHint: 'Tap the map where you are starting from.',
    startFrom: 'Start from', fromMe: 'your location', fromPin: 'the point you tapped', fromCentre: 'the map centre',
    finding: 'Finding the safest way…', outside: 'That point is outside the analysed area.',
    noRoute: 'No dry ground found within 8 km. Go up: the highest floor or roof of a strong building, and call for help.',
    walkTo: 'Walk {d} to {name}', dryGround: 'dry ground', minutes: 'about {n} min on foot',
    allDry: 'Dry all the way', deepest: 'Deepest water on the way: {d}', wetFor: '{d} of it through water',
    deepWarn: 'Part of the way is deeper than 0.5 m. Only cross still water, test the ground with a stick, and hold on to someone.',
    routeNote: 'Follows the ground and avoids floodwater in this scenario. It doesn’t know about walls, fences or broken bridges.',
    toShelter: 'To nearest shelter', toDry: 'To nearest dry ground', showRoute: 'Show route', openMaps: 'Directions in Google Maps',
    sheltersIntro: 'Schools, clinics, places of worship and community halls, checked against the flood in this scenario.',
    sheltersFrom: 'Distances from {from}.', dry: 'Dry', flooded: 'Flooded {d}', routeHere: 'Route', noShelters: 'No shelters mapped in OpenStreetMap near here.', sheltersWet: 'Every shelter nearby is in the flood, so this goes to the nearest dry ground.', atRisk: 'At risk {p}%', sheltersSlow: 'Shelters didn’t load in time, so this goes to the nearest dry ground.',
    loadingShelters: 'Looking up shelters in OpenStreetMap…', sheltersFail: 'OpenStreetMap is busy, so shelters couldn’t be loaded. The Route tool still finds the nearest dry ground.', retry: 'Try again',
    shareIntro: 'Tell family, neighbours or rescuers where you are and how bad it is.',
    shareSend: 'Send…', shareWhatsApp: 'WhatsApp', shareSms: 'SMS', shareCopy: 'Copy', copied: 'Copied',
    shareLink: 'Link to this map', shareLinkHint: 'Opens the same place and flood scenario for whoever you send it to.', copyLink: 'Copy link', contacts: 'Emergency contacts', contactsHint: 'Kept on this phone only. Start numbers with the country code (like +254) so WhatsApp works too.', addContact: 'Add a contact', contactName: 'Name', contactNum: 'Phone number', textAll: 'Text all ({n})', quickText: 'Text my contacts', quickShare: 'Share where I am', remove: 'Remove', noContacts: 'Add family or neighbours here, and the red flood alert gets a button that texts them all in one tap.',
    msgAt: 'I am at {place}', msgArea: 'Flood check for {place}', msgDeep: 'There is about {d} of water here and it is dangerous.',
    msgWet: 'Water is around {d} deep here.', msgEdge: 'Water is reaching the edge of where I am.', msgDry: 'It is dry where I am.',
    msgGoing: 'I am heading to {name}, {d} away.', msgMap: 'Map', msgNeedHelp: 'Please send help or call me.', msgTime: 'Sent {t}',
    marksIntro: 'Record how high water reached in past floods. Marks make the map more accurate for everyone here.',
    addMark: 'Add a mark', markHere: 'At my location', markTap: 'Tap the map where the water reached.',
    markDepth: 'Water above the ground (m)', markDate: 'When', markNote: 'Note (optional)', markPhoto: 'Photo (optional)', save: 'Save', cancel: 'Cancel',
    fitMarks: 'Match the flood to these marks', fitDone: 'Water level set to {s} from {n} mark(s).',
    fitNone: 'None of the marks are inside the analysed area yet.', noMarks: 'No marks yet.', synced: 'Also sent to your Google Sheet.',
    pastIntro: 'Where satellites have seen water since 1984. Pale areas flooded now and then; deep blue is water nearly all the time.',
    pastShow: 'Show past floods', pastRarely: 'Rarely water', pastAlways: 'Always water', opacity: 'Opacity',
    pastCheck: 'If your flood scenario covers the pale areas, it agrees with history.',
    tlIntro: 'The river forecast for each of the next 10 days, run through this flood map.',
    tlNeed: 'This needs an analysed area with a river forecast. Open Flood News once the area is analysed.',
    tlBuilding: 'Working out each day…', tlDay: '{day}: {q} m³/s · {a} flooded', play: 'Play', pause: 'Pause',
    tlNote: 'River flow from the GloFAS forecast for the main river, used as the discharge at the outlet.',
    langIntro: 'Tips, the grab bag, the safe route and shared messages switch language. The analysis panel stays in English for now.',
    noVoice: 'There is no {lang} voice on this device, so the default voice reads it.',
    bagIntro: 'Pack these now, so you can leave in minutes. Ticks stay on this phone.', bagDone: '{n} of {t} packed', bagReset: 'Start again',
    offIntro: 'Floods often cut mobile data. The app keeps working with what it has already loaded.',
    offApp: 'App saved for offline use', offAppNo: 'Offline mode is getting ready…', offAppNone: 'This browser can’t work offline.',
    offOnline: 'You are online', offOffline: 'You are offline: showing saved data',
    offTiles: 'Map pictures kept: {n}', offTilesHint: 'Move around your area at the zoom you need while online; what you see is kept.',
    offSave: 'Save this area for offline', offSaved: 'Saved: {name}', offOpen: 'Open saved area', offForget: 'Forget',
    offSavedOk: 'Area saved. Its terrain is stored on this device.', offNeedArea: 'Choose and analyze an area first.',
    offInstall: 'Add to home screen', offIsOffline: 'You’re offline. Your saved area is under Offline on the left.',
  },
  sw: {
    'rail.route': 'Njia', 'rail.shelters': 'Makazi', 'rail.offline': 'Bila mtandao', 'rail.share': 'Tuma',
    'rail.marks': 'Alama', 'rail.past': 'Zamani', 'rail.timeline': 'Siku 10', 'rail.lang': 'Lugha', 'rail.bag': 'Begi',
    'title.route': 'Njia salama kwa miguu', 'title.shelters': 'Makazi salama yaliyo karibu', 'title.offline': 'Inafanya kazi bila mtandao',
    'title.share': 'Tuma hali yangu', 'title.marks': 'Alama za mafuriko', 'title.past': 'Mafuriko ya zamani',
    'title.timeline': 'Mafuriko siku 10 zijazo', 'title.lang': 'Lugha', 'title.bag': 'Orodha ya begi la dharura',
    close: 'Funga', listen: 'Soma kwa sauti', stop: 'Acha kusoma',
    needScenario: 'Kwanza changanua ardhi na uweke hali ya mafuriko: njia inahitaji kujua maji yako wapi.',
    needAnalysis: 'Kwanza changanua ardhi ya eneo hili.',
    useLocation: 'Tumia mahali nilipo', pickOnMap: 'Gusa ramani', pickHint: 'Gusa ramani mahali unapoanzia.',
    startFrom: 'Kuanzia', fromMe: 'mahali ulipo', fromPin: 'sehemu uliyogusa', fromCentre: 'katikati ya ramani',
    finding: 'Natafuta njia salama zaidi…', outside: 'Sehemu hiyo iko nje ya eneo lililochanganuliwa.',
    noRoute: 'Hakuna ardhi kavu ndani ya km 8. Panda juu: ghorofa ya juu kabisa au paa la jengo imara, na uombe msaada.',
    walkTo: 'Tembea {d} hadi {name}', dryGround: 'ardhi kavu', minutes: 'takriban dakika {n} kwa miguu',
    allDry: 'Ni kavu njia yote', deepest: 'Kina kikubwa cha maji njiani: {d}', wetFor: '{d} kati yake ni ndani ya maji',
    deepWarn: 'Sehemu ya njia ina kina zaidi ya mita 0.5. Vuka maji yaliyotulia tu, pima ardhi kwa fimbo, na mshike mtu.',
    routeNote: 'Inafuata ardhi na kuepuka maji ya mafuriko katika hali hii. Haijui kuta, ua au madaraja yaliyovunjika.',
    toShelter: 'Hadi makazi ya karibu', toDry: 'Hadi ardhi kavu ya karibu', showRoute: 'Onyesha njia', openMaps: 'Maelekezo kwenye Google Maps',
    sheltersIntro: 'Shule, zahanati, nyumba za ibada na kumbi za jamii, zimekaguliwa dhidi ya mafuriko ya hali hii.',
    sheltersFrom: 'Umbali kutoka {from}.', dry: 'Kavu', flooded: 'Imefurika {d}', routeHere: 'Njia', noShelters: 'Hakuna makazi yaliyowekwa kwenye OpenStreetMap karibu na hapa.', sheltersWet: 'Makazi yote ya karibu yako ndani ya mafuriko, kwa hivyo njia hii inaenda ardhi kavu ya karibu.', atRisk: 'Hatarini {p}%', sheltersSlow: 'Makazi hayakupakia kwa wakati, kwa hivyo njia hii inaenda ardhi kavu ya karibu.',
    loadingShelters: 'Natafuta makazi kwenye OpenStreetMap…', sheltersFail: 'OpenStreetMap ina shughuli nyingi, kwa hivyo makazi hayakupakia. Zana ya Njia bado inapata ardhi kavu ya karibu.', retry: 'Jaribu tena',
    shareIntro: 'Waambie familia, majirani au waokoaji ulipo na hali ilivyo mbaya.',
    shareSend: 'Tuma…', shareWhatsApp: 'WhatsApp', shareSms: 'SMS', shareCopy: 'Nakili', copied: 'Imenakiliwa',
    shareLink: 'Kiungo cha ramani hii', shareLinkHint: 'Kinafungua mahali hapa na hali hii ya mafuriko kwa unayemtumia.', copyLink: 'Nakili kiungo', contacts: 'Watu wa dharura', contactsHint: 'Zinahifadhiwa kwenye simu hii tu. Anza namba kwa msimbo wa nchi (kama +254) ili WhatsApp ifanye kazi pia.', addContact: 'Ongeza mtu', contactName: 'Jina', contactNum: 'Namba ya simu', textAll: 'Tuma SMS kwa wote ({n})', quickText: 'Tuma SMS kwa watu wangu', quickShare: 'Tuma nilipo', remove: 'Ondoa', noContacts: 'Ongeza familia au majirani hapa, na tahadhari nyekundu ya mafuriko itapata kitufe cha kuwatumia wote SMS kwa mguso mmoja.',
    msgAt: 'Niko {place}', msgArea: 'Hali ya mafuriko {place}', msgDeep: 'Kuna maji ya kina cha takriban {d} hapa, ni hatari.',
    msgWet: 'Maji yana kina cha takriban {d} hapa.', msgEdge: 'Maji yanafika ukingoni mwa nilipo.', msgDry: 'Ni kavu nilipo.',
    msgGoing: 'Naelekea {name}, umbali wa {d}.', msgMap: 'Ramani', msgNeedHelp: 'Tafadhali tuma msaada au unipigie simu.', msgTime: 'Imetumwa {t}',
    marksIntro: 'Rekodi maji yalipofika katika mafuriko yaliyopita. Alama hufanya ramani iwe sahihi zaidi kwa kila mtu hapa.',
    addMark: 'Ongeza alama', markHere: 'Mahali nilipo', markTap: 'Gusa ramani mahali maji yalipofika.',
    markDepth: 'Kina cha maji juu ya ardhi (m)', markDate: 'Lini', markNote: 'Maelezo (si lazima)', markPhoto: 'Picha (si lazima)', save: 'Hifadhi', cancel: 'Ghairi',
    fitMarks: 'Linganisha mafuriko na alama hizi', fitDone: 'Kiwango cha maji kimewekwa {s} kutoka alama {n}.',
    fitNone: 'Hakuna alama ndani ya eneo lililochanganuliwa bado.', noMarks: 'Hakuna alama bado.', synced: 'Pia imetumwa kwenye Google Sheet yako.',
    pastIntro: 'Mahali satelaiti zimeona maji tangu 1984. Rangi hafifu ni mahali palipofurika mara kwa mara; bluu nzito ni maji karibu kila wakati.',
    pastShow: 'Onyesha mafuriko ya zamani', pastRarely: 'Maji mara chache', pastAlways: 'Maji kila wakati', opacity: 'Uwazi',
    pastCheck: 'Kama hali yako ya mafuriko inafunika sehemu hafifu, inakubaliana na historia.',
    tlIntro: 'Utabiri wa mto kwa kila moja ya siku 10 zijazo, kwenye ramani hii ya mafuriko.',
    tlNeed: 'Hii inahitaji eneo lililochanganuliwa lenye utabiri wa mto. Fungua Flood News baada ya kuchanganua.',
    tlBuilding: 'Nakokotoa kila siku…', tlDay: '{day}: {q} m³/s · {a} imefurika', play: 'Cheza', pause: 'Simamisha',
    tlNote: 'Mtiririko wa mto kutoka utabiri wa GloFAS wa mto mkuu, unatumika kama mtiririko kwenye mlango wa eneo.',
    langIntro: 'Vidokezo, begi la dharura, njia salama na ujumbe wa kutuma hubadilisha lugha. Paneli ya uchanganuzi inabaki kwa Kiingereza kwa sasa.',
    noVoice: 'Hakuna sauti ya {lang} kwenye kifaa hiki, kwa hivyo sauti ya kawaida inasoma.',
    bagIntro: 'Funga vitu hivi sasa, ili uweze kuondoka kwa dakika chache. Alama za tiki zinabaki kwenye simu hii.', bagDone: '{n} kati ya {t} vimefungwa', bagReset: 'Anza upya',
    offIntro: 'Mafuriko mara nyingi hukata mtandao wa simu. Programu inaendelea kufanya kazi na ilichokwisha pakia.',
    offApp: 'Programu imehifadhiwa kwa matumizi bila mtandao', offAppNo: 'Hali ya bila mtandao inaandaliwa…', offAppNone: 'Kivinjari hiki hakiwezi kufanya kazi bila mtandao.',
    offOnline: 'Uko mtandaoni', offOffline: 'Huna mtandao: inaonyesha data iliyohifadhiwa',
    offTiles: 'Picha za ramani zilizohifadhiwa: {n}', offTilesHint: 'Ukiwa mtandaoni, zunguka eneo lako kwa ukubwa unaohitaji; unachoona kinahifadhiwa.',
    offSave: 'Hifadhi eneo hili kwa matumizi bila mtandao', offSaved: 'Limehifadhiwa: {name}', offOpen: 'Fungua eneo lililohifadhiwa', offForget: 'Sahau',
    offSavedOk: 'Eneo limehifadhiwa. Ardhi yake imehifadhiwa kwenye kifaa hiki.', offNeedArea: 'Kwanza chagua na uchanganue eneo.',
    offInstall: 'Weka kwenye skrini ya mwanzo', offIsOffline: 'Huna mtandao. Eneo lako lililohifadhiwa liko chini ya "Bila mtandao" kushoto.',
  },
  fr: {
    'rail.route': 'Itinéraire', 'rail.shelters': 'Abris', 'rail.offline': 'Hors ligne', 'rail.share': 'Alerter',
    'rail.marks': 'Repères', 'rail.past': 'Passé', 'rail.timeline': '10 jours', 'rail.lang': 'Langue', 'rail.bag': 'Sac',
    'title.route': 'Itinéraire sûr à pied', 'title.shelters': 'Abri sûr le plus proche', 'title.offline': 'Fonctionne hors ligne',
    'title.share': 'Signaler ma situation', 'title.marks': 'Repères de crue', 'title.past': 'Crues passées',
    'title.timeline': 'La crue sur 10 jours', 'title.lang': 'Langue', 'title.bag': 'Sac d’urgence',
    close: 'Fermer', listen: 'Lire à voix haute', stop: 'Arrêter la lecture',
    needScenario: 'Analysez d’abord le terrain et choisissez un scénario de crue : l’itinéraire doit savoir où est l’eau.',
    needAnalysis: 'Analysez d’abord le terrain ici.',
    useLocation: 'Ma position', pickOnMap: 'Toucher la carte', pickHint: 'Touchez la carte à l’endroit d’où vous partez.',
    startFrom: 'Départ', fromMe: 'votre position', fromPin: 'le point touché', fromCentre: 'le centre de la carte',
    finding: 'Recherche du chemin le plus sûr…', outside: 'Ce point est hors de la zone analysée.',
    noRoute: 'Aucun terrain sec à moins de 8 km. Montez : dernier étage ou toit d’un bâtiment solide, et appelez à l’aide.',
    walkTo: 'Marchez {d} jusqu’à {name}', dryGround: 'un terrain sec', minutes: 'environ {n} min à pied',
    allDry: 'Au sec tout le long', deepest: 'Eau la plus profonde en chemin : {d}', wetFor: 'dont {d} dans l’eau',
    deepWarn: 'Une partie du trajet dépasse 0,5 m. Ne traversez que de l’eau calme, sondez le sol avec un bâton et tenez-vous à quelqu’un.',
    routeNote: 'Suit le terrain en évitant l’eau de ce scénario. Il ne connaît ni les murs, ni les clôtures, ni les ponts coupés.',
    toShelter: 'Vers l’abri le plus proche', toDry: 'Vers le terrain sec le plus proche', showRoute: 'Voir l’itinéraire', openMaps: 'Itinéraire dans Google Maps',
    sheltersIntro: 'Écoles, centres de santé, lieux de culte et salles communautaires, comparés à la crue de ce scénario.',
    sheltersFrom: 'Distances depuis {from}.', dry: 'Au sec', flooded: 'Inondé {d}', routeHere: 'Itinéraire', noShelters: 'Aucun abri cartographié dans OpenStreetMap près d’ici.', sheltersWet: 'Tous les abris proches sont dans la crue : l’itinéraire mène au terrain sec le plus proche.', atRisk: 'À risque {p} %', sheltersSlow: 'Les abris n’ont pas chargé à temps : l’itinéraire mène au terrain sec le plus proche.',
    loadingShelters: 'Recherche des abris dans OpenStreetMap…', sheltersFail: 'OpenStreetMap est saturé, les abris n’ont pas pu être chargés. L’outil Itinéraire trouve quand même le terrain sec le plus proche.', retry: 'Réessayer',
    shareIntro: 'Dites à vos proches, voisins ou secours où vous êtes et ce qui se passe.',
    shareSend: 'Envoyer…', shareWhatsApp: 'WhatsApp', shareSms: 'SMS', shareCopy: 'Copier', copied: 'Copié',
    shareLink: 'Lien vers cette carte', shareLinkHint: 'Ouvre le même lieu et le même scénario chez la personne qui le reçoit.', copyLink: 'Copier le lien', contacts: 'Contacts d’urgence', contactsHint: 'Gardés sur ce téléphone uniquement. Commencez par l’indicatif du pays (par ex. +221) pour que WhatsApp fonctionne aussi.', addContact: 'Ajouter un contact', contactName: 'Nom', contactNum: 'Numéro de téléphone', textAll: 'SMS à tous ({n})', quickText: 'Prévenir mes contacts', quickShare: 'Partager ma position', remove: 'Retirer', noContacts: 'Ajoutez ici famille ou voisins : l’alerte rouge aura un bouton pour leur envoyer un SMS en un geste.',
    msgAt: 'Je suis à {place}', msgArea: 'Point crue pour {place}', msgDeep: 'Il y a environ {d} d’eau ici, c’est dangereux.',
    msgWet: 'L’eau atteint environ {d} ici.', msgEdge: 'L’eau arrive au bord de là où je suis.', msgDry: 'C’est au sec là où je suis.',
    msgGoing: 'Je vais vers {name}, à {d}.', msgMap: 'Carte', msgNeedHelp: 'Envoyez de l’aide ou appelez-moi.', msgTime: 'Envoyé {t}',
    marksIntro: 'Notez la hauteur atteinte par l’eau lors des crues passées. Les repères rendent la carte plus juste pour tout le monde ici.',
    addMark: 'Ajouter un repère', markHere: 'À ma position', markTap: 'Touchez la carte là où l’eau est montée.',
    markDepth: 'Hauteur d’eau au-dessus du sol (m)', markDate: 'Quand', markNote: 'Note (facultatif)', markPhoto: 'Photo (facultatif)', save: 'Enregistrer', cancel: 'Annuler',
    fitMarks: 'Caler la crue sur ces repères', fitDone: 'Niveau d’eau réglé à {s} d’après {n} repère(s).',
    fitNone: 'Aucun repère n’est encore dans la zone analysée.', noMarks: 'Aucun repère pour l’instant.', synced: 'Envoyé aussi à votre Google Sheet.',
    pastIntro: 'Là où les satellites ont vu de l’eau depuis 1984. Les zones pâles ont été inondées de temps en temps ; le bleu foncé est presque toujours en eau.',
    pastShow: 'Afficher les crues passées', pastRarely: 'Rarement en eau', pastAlways: 'Toujours en eau', opacity: 'Opacité',
    pastCheck: 'Si votre scénario couvre les zones pâles, il concorde avec l’histoire.',
    tlIntro: 'La prévision du fleuve pour chacun des 10 prochains jours, appliquée à cette carte.',
    tlNeed: 'Il faut une zone analysée avec une prévision du fleuve. Ouvrez Flood News après l’analyse.',
    tlBuilding: 'Calcul de chaque jour…', tlDay: '{day} : {q} m³/s · {a} inondés', play: 'Lecture', pause: 'Pause',
    tlNote: 'Débit issu de la prévision GloFAS pour le fleuve principal, utilisé comme débit à l’exutoire.',
    langIntro: 'Les conseils, le sac d’urgence, l’itinéraire sûr et les messages changent de langue. Le panneau d’analyse reste en anglais pour l’instant.',
    noVoice: 'Aucune voix en {lang} sur cet appareil : la voix par défaut lit le texte.',
    bagIntro: 'Préparez ceci dès maintenant pour partir en quelques minutes. Les coches restent sur ce téléphone.', bagDone: '{n} sur {t} prêts', bagReset: 'Recommencer',
    offIntro: 'Les crues coupent souvent les données mobiles. L’application continue avec ce qu’elle a déjà chargé.',
    offApp: 'Application prête hors ligne', offAppNo: 'Préparation du mode hors ligne…', offAppNone: 'Ce navigateur ne peut pas fonctionner hors ligne.',
    offOnline: 'Vous êtes en ligne', offOffline: 'Hors ligne : données enregistrées',
    offTiles: 'Images de carte gardées : {n}', offTilesHint: 'En ligne, parcourez votre zone au zoom voulu ; ce que vous voyez est gardé.',
    offSave: 'Garder cette zone hors ligne', offSaved: 'Gardée : {name}', offOpen: 'Ouvrir la zone gardée', offForget: 'Oublier',
    offSavedOk: 'Zone gardée. Son relief est stocké sur cet appareil.', offNeedArea: 'Choisissez et analysez d’abord une zone.',
    offInstall: 'Ajouter à l’écran d’accueil', offIsOffline: 'Vous êtes hors ligne. Votre zone gardée est dans « Hors ligne » à gauche.',
  },
};

let cur = (() => {
  try { const v = localStorage.getItem(KEY); if (LANGS[v]) return v; } catch { /* storage unavailable */ }
  const nav = (navigator.language || 'en').slice(0, 2);
  return LANGS[nav] ? nav : 'en';
})();
const subs = new Set();

export const languages = LANGS;
export const lang = () => cur;
export function setLang(l) {
  if (!LANGS[l] || l === cur) return;
  cur = l;
  try { localStorage.setItem(KEY, l); } catch { /* storage unavailable */ }
  document.documentElement.lang = l;
  stopSpeak();
  subs.forEach((fn) => fn(l));
}
export const onLang = (fn) => subs.add(fn);

/** Translate a key, filling {placeholders}. Falls back to English. */
export function t(key, vars = {}) {
  const s = S[cur][key] ?? S.en[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
}

/** Distance in the reader's language. */
export function dist(m) {
  const n = (v, d) => v.toLocaleString(cur, { maximumFractionDigits: d });
  return m < 1000 ? `${n(Math.max(10, Math.round(m / 10) * 10), 0)} m` : `${n(m / 1000, m < 10000 ? 1 : 0)} km`;
}

// ---------- Read aloud ----------
let speaking = null;
export const canSpeak = 'speechSynthesis' in window;
export function speak(text, onEnd) {
  if (!canSpeak) return false;
  stopSpeak();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = VOICE[cur];
  const voices = speechSynthesis.getVoices();
  const v = voices.find((x) => x.lang?.toLowerCase().startsWith(cur));
  if (v) u.voice = v;
  u.rate = 0.95;
  u.onend = u.onerror = () => { if (speaking === u) speaking = null; onEnd?.(); };
  speaking = u;
  speechSynthesis.speak(u);
  return voices.length && !v ? 'novoice' : true;
}
export function stopSpeak() {
  if (canSpeak && (speaking || speechSynthesis.speaking)) speechSynthesis.cancel();
  speaking = null;
}
export const isSpeaking = () => !!speaking;
