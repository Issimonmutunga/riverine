/**
 * Flood Depth: Google Sheet backend for Saved places, flood marks, the shared dataset catalogue and
 * DEM survey requests. Each kind of record gets its own tab.
 *
 * Set up (5 minutes):
 *   1. Create a Google Sheet. Extensions → Apps Script. Replace the code with this file. Save.
 *   2. Deploy → New deployment → type "Web app". Execute as: Me. Who has access: Anyone. Deploy.
 *   3. Copy the web-app URL (ends in /exec). In Flood Depth: bookmark at the top → gear → paste → Save.
 *      To share one catalogue with everyone using your copy of the app, put the URL in js/config.js.
 */
const TABS = { place: 'Places', mark: 'Flood marks', dataset: 'Datasets', demRequest: 'DEM requests' };
const HEAD = {
  place: ['savedAt', 'name', 'bbox', 'note'],
  mark: ['savedAt', 'name', 'bbox', 'note'],
  dataset: ['savedAt', 'title', 'url', 'kind', 'res', 'licence', 'by', 'bbox'],
  demRequest: ['savedAt', 'name', 'contact', 'org', 'resolution', 'purpose', 'area', 'bbox'],
};

function tab(type) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(TABS[type]);
  if (!sh) { sh = ss.insertSheet(TABS[type]); sh.appendRow(HEAD[type]); sh.setFrozenRows(1); }
  return sh;
}
function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
// Text that starts like a formula is stored as plain text.
function safe(v) {
  const s = String(v == null ? '' : v).slice(0, 2000);
  return /^[=+\-@]/.test(s) ? `'${s}` : s;
}

/** GET: a health check, or the datasets whose box overlaps ?w=&s=&e=&n= (newest first). */
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === 'list' && p.type === 'dataset') {
    const rows = tab('dataset').getDataRange().getValues();
    const head = rows.shift();
    const w = +p.w, s = +p.s, ea = +p.e, n = +p.n;
    const out = rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])))
      .filter((r) => {
        const b = String(r.bbox).split(',').map(Number);
        if (b.length !== 4 || b.some(isNaN) || [w, s, ea, n].some(isNaN)) return true;
        return !(b[0] > ea || b[2] < w || b[1] > n || b[3] < s);
      })
      .reverse().slice(0, 200);
    return json({ ok: true, rows: out });
  }
  return json({ ok: true });
}

/** POST (form fields): append one record. `type` is place (default), mark, dataset or demRequest. */
function doPost(e) {
  const p = (e && e.parameter) || {};
  const type = HEAD[p.type] ? p.type : 'place';
  if (type === 'dataset' && !/^https?:\/\//i.test(p.url || '')) return json({ ok: false, error: 'Links must start with http:// or https://' });
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    tab(type).appendRow(HEAD[type].map((h) => (h === 'savedAt' ? (p.savedAt || new Date().toISOString()) : safe(p[h]))));
  } finally {
    lock.releaseLock();
  }
  return json({ ok: true });
}
