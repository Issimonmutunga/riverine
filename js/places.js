/**
 * places.js — Save & restore visited places.
 *
 * Storage strategy (layered):
 *   1. localStorage  — instant, always available, device-local.
 *   2. Google Sheets — persisted server-side via an Apps Script web app.
 *                      Paste the URL in the app UI (gear icon in Saved places).
 *
 * Each saved place record:
 *   { id, name, bbox: {w,s,e,n,lat,lng}, note, savedAt }
 */

const LS_KEY        = 'flooddepth_places_v1';
const LS_SHEETS_KEY = 'flooddepth_sheets_url';

// ── localStorage helpers ──────────────────────────────────────────────────────
function lsLoad() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
}
function lsSave(places) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(places)); } catch { /* storage full */ }
}

// ── Apps Script URL (stored in localStorage so no code editing needed) ────────
export function getScriptUrl() {
  return localStorage.getItem(LS_SHEETS_KEY) || '';
}
export function setScriptUrl(url) {
  if (url) localStorage.setItem(LS_SHEETS_KEY, url);
  else      localStorage.removeItem(LS_SHEETS_KEY);
}

/** Test the URL by doing a GET (the Apps Script doGet returns {ok:true}). */
export async function testScriptUrl(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (!json.ok) throw new Error('Unexpected response from Apps Script');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Save a place. Writes to localStorage immediately and fires-and-forgets to
 * the Apps Script endpoint when a URL is configured.
 */
export function savePlace({ name, bbox, note = '' }) {
  const record = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: name || 'Unnamed place',
    bbox,
    note,
    savedAt: new Date().toISOString(),
  };

  // 1. localStorage — always
  const places = lsLoad();
  places.unshift(record);
  lsSave(places);

  // 2. Remote — fire and forget
  const url = getScriptUrl();
  if (url) {
    const body = new URLSearchParams({
      name:    record.name,
      bbox:    bbox ? `${bbox.w},${bbox.s},${bbox.e},${bbox.n}` : '',
      note:    record.note,
      savedAt: record.savedAt,
    });
    fetch(url, { method: 'POST', body }).catch(() => {/* offline — localStorage is enough */});
  }

  return record;
}

/** Return all locally saved places, newest first. */
export function loadPlaces() {
  return lsLoad();
}

/** Delete a place by id from localStorage. */
export function deletePlace(id) {
  lsSave(lsLoad().filter(p => p.id !== id));
}
