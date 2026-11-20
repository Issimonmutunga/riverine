// Quick map: one tap makes a high-resolution A3 PDF of what is on the map, laid out like a printed
// topographic sheet from East and South-East Asia (Japan's GSI, Korea's NGII, Singapore, China's standard
// map sheets): a double neatline, a ticked "ruler" frame with degree-minute graticule, a ruled title block,
// a legend panel, a bar scale, a locator inset and a plain list of sources. Everything on screen is redrawn
// onto a large canvas (tiles, flood rasters, rivers, buildings, marks), so the print matches the screen.

const JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
const INK = [27, 31, 36], GREY = [110, 116, 124], RULE = [150, 156, 164], PALE = [236, 238, 241], BLUE = [11, 61, 145];

// The print always uses the standard OpenStreetMap base map, whatever the screen shows.
const PRINT_BASE = [
  { _url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', options: { maxNativeZoom: 19, zIndex: 1, subdomains: '', attribution: 'Base map (c) OpenStreetMap contributors' } },
];

let jsPdfLoading = null;
function loadJsPdf() {
  if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  jsPdfLoading ||= new Promise((resolve, reject) => {
    const s = Object.assign(document.createElement('script'), { src: JSPDF, crossOrigin: 'anonymous' });
    s.onload = () => (window.jspdf?.jsPDF ? resolve(window.jspdf.jsPDF) : reject(new Error('PDF tool did not load')));
    s.onerror = () => { jsPdfLoading = null; reject(new Error('Could not load the PDF tool. Check your connection.')); };
    document.head.append(s);
  });
  return jsPdfLoading;
}

const strip = (html) => String(html || '').replace(/<[^>]*>/g, '').replace(/&copy;/g, '(c)').replace(/©/g, '(c)').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const ascii = (s) => String(s).replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/·/g, '-').replace(/×/g, 'x').replace(/[^\x20-\x7E°±]/g, '');
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const rgb = (a) => `rgb(${a[0]},${a[1]},${a[2]})`;

// ---------- Degrees, minutes, seconds ----------
const STEPS = [30, 20, 10, 5, 2, 1, 0.5, 0.25, 1 / 6, 1 / 12, 1 / 30, 1 / 60, 1 / 120, 1 / 360, 1 / 720, 1 / 1800, 1 / 3600];
function niceStep(span, want = 6) {
  let best = STEPS[0];
  for (const s of STEPS) { if (span / s >= want * 0.7) { best = s; break; } }
  return best;
}
function dms(v, step, axis) {
  const hemi = axis === 'lat' ? (v < 0 ? 'S' : 'N') : (v < 0 ? 'W' : 'E');
  let a = Math.abs(v) + 1e-9;
  const d = Math.floor(a); a = (a - d) * 60;
  const m = Math.floor(a); const s = Math.round((a - m) * 60);
  if (step >= 1) return `${d}°${hemi}`;
  if (step >= 1 / 60 - 1e-9) return `${d}°${String(m).padStart(2, '0')}'${hemi}`;
  return `${d}°${String(m).padStart(2, '0')}'${String(s).padStart(2, '0')}"${hemi}`;
}
function dmsFull(lat, lng) {
  const f = (v, pos, neg) => {
    const a = Math.abs(v), d = Math.floor(a), mf = (a - d) * 60, m = Math.floor(mf), s = ((mf - m) * 60).toFixed(0);
    return `${d}°${String(m).padStart(2, '0')}'${String(s).padStart(2, '0')}"${v < 0 ? neg : pos}`;
  };
  return `${f(lat, 'N', 'S')}  ${f(lng, 'E', 'W')}`;
}
function niceDistance(maxM) {
  const pow = 10 ** Math.floor(Math.log10(maxM));
  for (const k of [5, 2, 1]) if (k * pow <= maxM) return k * pow;
  return pow;
}
const fmtDist = (m) => (m >= 1000 ? `${+(m / 1000).toFixed(m % 1000 ? 1 : 0)} km` : `${m} m`);

// ---------- Colour ramps from the on-screen legend ----------
function splitTop(str) {
  const out = []; let d = 0, cur = '';
  for (const ch of str) {
    if (ch === '(') d++;
    if (ch === ')') d--;
    if (ch === ',' && d === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}
function rampCanvas(css, w = 600, h = 24) {
  const m = /linear-gradient\((.*)\)\s*$/.exec(css);
  if (!m) return null;
  const parts = splitTop(m[1]).slice(1);
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, w, 0);
  parts.forEach((p, i) => {
    const pm = /^(.*?)\s+([\d.]+)%$/.exec(p);
    const color = pm ? pm[1] : p, at = pm ? +pm[2] / 100 : i / Math.max(1, parts.length - 1);
    try { grad.addColorStop(clamp(at, 0, 1), color); } catch { /* skip an unreadable stop */ }
  });
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
  return c;
}
function readLegend() {
  const el = document.getElementById('legend');
  if (!el || el.hidden) return [];
  const out = [];
  const heads = [...el.querySelectorAll('h4')];
  for (const h of heads) {
    const ramp = h.nextElementSibling;
    const ticksEl = ramp?.nextElementSibling;
    if (!ramp?.classList.contains('ramp')) continue;
    const spans = [...(ticksEl?.querySelectorAll('span') || [])];
    const abs = ticksEl?.classList.contains('abs');
    const ticks = spans.map((s, i) => ({ at: abs ? parseFloat(s.style.left) / 100 : (spans.length > 1 ? i / (spans.length - 1) : 0), text: s.textContent }));
    out.push({ title: h.textContent, canvas: rampCanvas(ramp.style.background || getComputedStyle(ramp).backgroundImage), ticks });
  }
  return out;
}

// ---------- Tiles ----------
async function fetchTile(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20000);
  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit', signal: ctl.signal });
    if (!res.ok) return null;
    return await createImageBitmap(await res.blob());
  } catch { return null; } finally { clearTimeout(timer); }
}
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } }));
}
function tileUrl(layer, x, y, z) {
  const subs = Array.isArray(layer.options.subdomains) ? layer.options.subdomains : String(layer.options.subdomains || 'abc').split('');
  return L.Util.template(layer._url, { s: subs[(x + y) % subs.length], x, y, z, r: '' });
}

/** Draw every visible tile layer for the pixel window [tlx, tly, W, H] at fractional zoom zp. */
async function drawTiles(ctx2, map, layers, zp, tlx, tly, W, H, onTile) {
  for (const layer of layers) {
    const maxN = layer.options.maxNativeZoom ?? layer.options.maxZoom ?? 18;
    let zt = clamp(Math.round(zp - 1), 0, maxN);
    const count = (z) => { const t = 256 * 2 ** (zp - z); return (Math.floor((tlx + W) / t) - Math.floor(tlx / t) + 1) * (Math.floor((tly + H) / t) - Math.floor(tly / t) + 1); };
    while (count(zt) > 160 && zt > 0) zt -= 1; // too many tiles: use a coarser level, never hammer the tile servers
    const sz = 256 * 2 ** (zp - zt), n = 2 ** zt, jobs = [];
    const x0 = Math.floor(tlx / sz), x1 = Math.floor((tlx + W) / sz), y0 = Math.floor(tly / sz), y1 = Math.floor((tly + H) / sz);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (y >= 0 && y < n) jobs.push({ x, y, wx: ((x % n) + n) % n });
    const blend = layer.options.blend || (layer.options.className === 'hillshade-blend' ? 'soft-light' : null);
    await pool(jobs, 8, async (j) => {
      const bmp = await fetchTile(tileUrl(layer, j.wx, j.y, zt));
      onTile();
      if (!bmp) return;
      ctx2.save();
      ctx2.globalAlpha = layer.options.opacity ?? 1;
      if (blend) ctx2.globalCompositeOperation = blend;
      ctx2.drawImage(bmp, Math.floor(j.x * sz - tlx), Math.floor(j.y * sz - tly), Math.ceil(sz) + 1, Math.ceil(sz) + 1);
      ctx2.restore();
      bmp.close?.();
    });
  }
}

// ---------- The map picture ----------
const flatRings = (ll) => (ll.length && ll[0] && ll[0].lat !== undefined ? [ll] : ll.flatMap(flatRings));

async function renderMap(ctx, W, H, dpi, onProgress) {
  const { map, state } = ctx;
  const size = map.getSize();
  if (!size.x || !size.y) throw new Error('The map is not visible right now. Show the map and try again.');
  const scale = Math.min(W / size.x, H / size.y);          // print pixels per screen pixel
  const zp = map.getZoom() + Math.log2(scale);              // fractional zoom of the print
  const crs = map.options.crs;
  const center = crs.latLngToPoint(map.getCenter(), zp);
  const tlx = center.x - W / 2, tly = center.y - H / 2;
  const P = (ll) => { const p = crs.latLngToPoint(ll, zp); return [p.x - tlx, p.y - tly]; };
  const k = scale * 0.85;                                    // line widths and symbols, in print pixels

  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const c = canvas.getContext('2d');
  c.fillStyle = '#eef0f2'; c.fillRect(0, 0, W, H);

  const all = Object.values(map._layers);
  const tiles = PRINT_BASE;
  let done = 0, total = 1;
  total = Math.max(1, tiles.length * 40);
  await drawTiles(c, map, tiles, zp, tlx, tly, W, H, () => onProgress(Math.min(0.9, ++done / total)));

  const seen = { aoi: false, streams: false, exposure: false, marks: false, me: false, route: false };

  // Flood and terrain rasters, lowest first.
  const images = all.filter((l) => l instanceof L.ImageOverlay && l._image).sort((a, b) => (a.options.zIndex || 0) - (b.options.zIndex || 0));
  for (const l of images) {
    const img = l._image;
    if (!img.complete || !img.naturalWidth) continue;
    const b = l.getBounds(), nw = P(b.getNorthWest()), se = P(b.getSouthEast());
    c.save();
    c.globalAlpha = l.options.opacity ?? 1;
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.drawImage(img, nw[0], nw[1], se[0] - nw[0], se[1] - nw[1]);
    c.restore();
  }

  const strokeOf = (o) => {
    c.lineWidth = Math.max(0.5, (o.weight ?? 3) * k);
    c.strokeStyle = o.color || '#3388ff';
    c.globalAlpha = o.opacity ?? 1;
    c.lineCap = o.lineCap || 'round'; c.lineJoin = o.lineJoin || 'round';
    c.setLineDash(o.dashArray ? String(o.dashArray).split(/[ ,]+/).map((v) => +v * k) : []);
  };
  const mpp = (lat) => (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (256 * 2 ** zp);

  // Vectors: paths first, then points, so symbols sit on top of lines like they do on screen.
  const paths = all.filter((l) => l instanceof L.Polyline && !(l instanceof L.CircleMarker));
  for (const l of paths) {
    const o = l.options;
    if (l === state.aoiRect) seen.aoi = true;
    else if (o.color === '#0b3d91') seen.streams = true;
    else if (o.color === '#248a3d') seen.route = true;
    const isPoly = l instanceof L.Polygon;
    for (const ring of flatRings(l.getLatLngs())) {
      if (!ring.length) continue;
      c.beginPath();
      ring.forEach((ll, i) => { const [x, y] = P(ll); if (i) c.lineTo(x, y); else c.moveTo(x, y); });
      if (isPoly) c.closePath();
      if (isPoly && o.fill !== false) { c.globalAlpha = o.fillOpacity ?? 0.2; c.fillStyle = o.fillColor || o.color || '#3388ff'; c.fill(); }
      if (o.stroke !== false) { strokeOf(o); c.stroke(); }
      c.globalAlpha = 1; c.setLineDash([]);
    }
  }
  const dots = all.filter((l) => l instanceof L.CircleMarker);
  for (const l of dots) {
    const o = l.options, [x, y] = P(l.getLatLng());
    if (x < -50 || y < -50 || x > W + 50 || y > H + 50) continue;
    const r = l instanceof L.Circle ? l.getRadius() / mpp(l.getLatLng().lat) : (o.radius || 4) * k;
    if (l === ctx.me?.marker) seen.me = true;
    else if (l instanceof L.Circle) seen.me = true;
    else if (o.weight === 0 && o.radius === 3) seen.exposure = true;
    c.beginPath(); c.arc(x, y, Math.max(0.6, r), 0, Math.PI * 2);
    if (o.fill !== false) { c.globalAlpha = o.fillOpacity ?? 0.2; c.fillStyle = o.fillColor || o.color || '#3388ff'; c.fill(); }
    if (o.stroke !== false && (o.weight ?? 3) > 0) { strokeOf(o); c.stroke(); }
    c.globalAlpha = 1; c.setLineDash([]);
  }
  // Pins with a label (flood marks).
  for (const l of all.filter((x) => x instanceof L.Marker)) {
    const [x, y] = P(l.getLatLng());
    const label = strip(l.options.icon?.options?.html);
    if (l.options.icon?.options?.className === 'mark-pin') seen.marks = true;
    const r = 7 * k;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2);
    c.fillStyle = '#e0301e'; c.fill(); c.lineWidth = 2 * k; c.strokeStyle = '#fff'; c.stroke();
    if (label) {
      c.font = `700 ${Math.round(13 * k)}px Helvetica, Arial, sans-serif`;
      c.lineWidth = 4 * k; c.strokeStyle = 'rgba(255,255,255,.95)'; c.lineJoin = 'round';
      c.strokeText(label, x + r + 3 * k, y + 4 * k); c.fillStyle = '#7a1208'; c.fillText(label, x + r + 3 * k, y + 4 * k);
    }
  }
  return { canvas, zp, scale, crs, tlx, tly, seen, tiles, mpp: mpp(map.getCenter().lat), center: map.getCenter() };
}

/** A small context map: the same base tiles, zoomed far out, with a box showing where the print is. */
async function renderInset(ctx, view, W, H) {
  const map = ctx.map, zpFrame = view.zp;
  // Zoom out until the printed area is about a fifth of the inset.
  const zi = clamp(zpFrame + Math.log2((Math.min(W, H) / 5) / Math.min(view.canvasW, view.canvasH)), 1, 12);
  const crs = map.options.crs, cen = crs.latLngToPoint(view.center, zi);
  const tlx = cen.x - W / 2, tly = cen.y - H / 2;
  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const c = canvas.getContext('2d');
  c.fillStyle = '#dfe3e8'; c.fillRect(0, 0, W, H);
  const osm = view.tiles[0];
  if (osm) {
    c.filter = 'grayscale(1) contrast(.92) brightness(1.05)';
    await drawTiles(c, map, [{ ...osm, options: { ...osm.options, opacity: 1, className: '' }, _url: osm._url }], zi, tlx, tly, W, H, () => {});
    c.filter = 'none';
  }
  // The printed extent.
  const half = { x: view.canvasW / 2, y: view.canvasH / 2 };
  const f = 2 ** (zi - zpFrame), w = half.x * 2 * f, h = half.y * 2 * f;
  c.lineWidth = Math.max(3, W / 120); c.strokeStyle = '#d0211b'; c.fillStyle = 'rgba(208,33,27,.12)';
  c.fillRect(W / 2 - w / 2, H / 2 - h / 2, w, h); c.strokeRect(W / 2 - w / 2, H / 2 - h / 2, w, h);
  return canvas;
}

// ---------- The sheet ----------
function sheet(doc, ctx, view, mapCanvas, inset, opts) {
  const PW = 420, PH = 297;
  const { frame, panel, dpi } = opts;
  const mmPerPx = 25.4 / dpi;
  const title = ascii(ctx.areaName() || 'Flood exposure map');
  const now = new Date();
  const dateTxt = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const metersPerMm = view.mpp / mmPerPx;                     // ground metres per millimetre on paper
  const ratio = Math.round((metersPerMm * 1000) / 100) * 100;

  doc.setProperties({ title: `Flood Depth: ${title}`, subject: 'Flood exposure map', creator: 'Flood Depth' });
  doc.setFillColor(255, 255, 255); doc.rect(0, 0, PW, PH, 'F');

  // Double neatline, thick outside and fine inside.
  doc.setDrawColor(...INK); doc.setLineWidth(0.9); doc.rect(6, 6, PW - 12, PH - 12);
  doc.setLineWidth(0.25); doc.rect(7.8, 7.8, PW - 15.6, PH - 15.6);

  // Title block, ruled like a map sheet: name and subtitle on the left, scale and date boxes on the right.
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setCharSpace(1.6);
  doc.text('FLOOD DEPTH  |  QUICK MAP', 20, 15.2); doc.setCharSpace(0);
  doc.setFontSize(27); doc.text(title.length > 38 ? `${title.slice(0, 36)}...` : title, 20, 27);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...GREY);
  doc.text('Terrain-based flood exposure guide. Not an official warning.', 20, 32.4);
  doc.setDrawColor(...INK); doc.setLineWidth(0.5); doc.line(20, 34.2, frame.x + frame.w, 34.2);
  // Right side boxes
  const bx = panel.x, bw = panel.w;
  doc.setLineWidth(0.3); doc.setDrawColor(...INK);
  doc.rect(bx, 12, bw, 20);
  doc.line(bx + bw / 2, 12, bx + bw / 2, 32); doc.line(bx, 19, bx + bw, 19);
  doc.setFontSize(6.5); doc.setTextColor(...GREY); doc.text('SCALE', bx + 2, 16.6); doc.text('PRINTED', bx + bw / 2 + 2, 16.6);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...INK);
  doc.text(`1 : ${ratio.toLocaleString('en-GB')}`, bx + 2, 27.6); doc.setFontSize(10);
  doc.text(dateTxt, bx + bw / 2 + 2, 27.6);

  // The map, with a hairline frame.
  doc.addImage(mapCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', frame.x, frame.y, frame.w, frame.h, undefined, 'FAST');

  // Graticule: faint lines across the map, and an alternating black/white ruler around the frame.
  const crs = view.crs;
  const toMm = (ll) => { const p = crs.latLngToPoint(ll, view.zp); return [frame.x + (p.x - view.tlx) * mmPerPx, frame.y + (p.y - view.tly) * mmPerPx]; };
  const inv = (mx, my) => crs.pointToLatLng(L.point((mx - frame.x) / mmPerPx + view.tlx, (my - frame.y) / mmPerPx + view.tly), view.zp);
  const tl = inv(frame.x, frame.y), br = inv(frame.x + frame.w, frame.y + frame.h);
  const lonStep = niceStep(br.lng - tl.lng, 6), latStep = niceStep(tl.lat - br.lat, 5);
  const lons = [], lats = [];
  for (let v = Math.ceil(tl.lng / lonStep) * lonStep; v < br.lng; v += lonStep) lons.push(v);
  for (let v = Math.ceil(br.lat / latStep) * latStep; v < tl.lat; v += latStep) lats.push(v);
  const lonX = lons.map((v) => toMm(L.latLng(tl.lat, v))[0]);
  const latY = lats.map((v) => toMm(L.latLng(v, tl.lng))[1]);
  doc.setDrawColor(70, 76, 84); doc.setLineWidth(0.1); doc.setLineDashPattern([0.6, 1.2], 0);
  lonX.forEach((x) => doc.line(x, frame.y, x, frame.y + frame.h));
  latY.forEach((y) => doc.line(frame.x, y, frame.x + frame.w, y));
  doc.setLineDashPattern([], 0);
  // Ruler: segments between ticks alternate black and white (the sheet-edge scale used on many Asian topographic maps).
  const RW = 1.7;
  const ruler = (edge, stops, from, to) => {
    const marks = [from, ...stops, to];
    marks.slice(0, -1).forEach((a, i) => {
      const b = marks[i + 1];
      doc.setFillColor(...(i % 2 ? [255, 255, 255] : INK));
      if (edge === 'top') doc.rect(a, frame.y - RW, b - a, RW, 'FD');
      if (edge === 'bottom') doc.rect(a, frame.y + frame.h, b - a, RW, 'FD');
      if (edge === 'left') doc.rect(frame.x - RW, a, RW, b - a, 'FD');
      if (edge === 'right') doc.rect(frame.x + frame.w, a, RW, b - a, 'FD');
    });
  };
  doc.setDrawColor(...INK); doc.setLineWidth(0.2);
  ruler('top', lonX, frame.x, frame.x + frame.w); ruler('bottom', lonX, frame.x, frame.x + frame.w);
  ruler('left', latY, frame.y, frame.y + frame.h); ruler('right', latY, frame.y, frame.y + frame.h);
  doc.setLineWidth(0.5); doc.setDrawColor(...INK); doc.rect(frame.x, frame.y, frame.w, frame.h);
  // Coordinate labels.
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...INK);
  lons.forEach((v, i) => {
    const x = lonX[i], t = dms(v, lonStep, 'lon');
    doc.text(t, x, frame.y - RW - 1.1, { align: 'center' });
    doc.text(t, x, frame.y + frame.h + RW + 3.3, { align: 'center' });
  });
  lats.forEach((v, i) => {
    const y = latY[i], t = dms(v, latStep, 'lat');
    doc.text(t, frame.x - RW - 1.2, y + 0.9, { align: 'right' });
    doc.text(t, frame.x + frame.w + RW + 1.2, y + 0.9, { align: 'left' });
  });

  // ---- Right-hand panel ----
  let y = frame.y;
  const px = panel.x, pw = panel.w, bottom = frame.y + frame.h;
  const head = (txt) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...INK); doc.setCharSpace(0.9);
    doc.text(txt.toUpperCase(), px, y + 3.6); doc.setCharSpace(0);
    doc.setDrawColor(...INK); doc.setLineWidth(0.5); doc.line(px, y + 5, px + pw, y + 5);
    doc.setLineWidth(0.12); doc.line(px, y + 5.7, px + pw, y + 5.7);
    y += 9;
  };

  // North arrow + bar scale
  head('Scale and north');
  const barM = niceDistance(metersPerMm * 42), barMm = barM / metersPerMm, segs = 4, x0 = px + 2;
  for (let i = 0; i < segs; i++) {
    doc.setFillColor(...(i % 2 ? [255, 255, 255] : INK)); doc.setDrawColor(...INK); doc.setLineWidth(0.25);
    doc.rect(x0 + (barMm / segs) * i, y + 2, barMm / segs, 2.6, 'FD');
  }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...INK);
  for (let i = 0; i <= segs; i++) {
    const v = (barM / segs) * i;
    doc.text(i === segs ? fmtDist(v) : String(v >= 1000 ? +(v / 1000).toFixed(2) : v), x0 + (barMm / segs) * i, y + 8.2, { align: 'center' });
  }
  doc.setFontSize(6.8); doc.setTextColor(...GREY); doc.text(`1 cm on paper = ${fmtDist(Math.round(metersPerMm * 10))}`, x0, y + 12.2);
  // North arrow: a plain half-shaded arrow with N, as on Japanese and Korean sheets.
  const nx = px + pw - 9, ny = y + 1.4;
  doc.setFillColor(...INK); doc.setDrawColor(...INK); doc.setLineWidth(0.25);
  doc.triangle(nx, ny, nx - 3.2, ny + 9.5, nx, ny + 7.2, 'FD');
  doc.setFillColor(255, 255, 255); doc.triangle(nx, ny, nx + 3.2, ny + 9.5, nx, ny + 7.2, 'FD');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...INK); doc.text('N', nx, ny + 13.6, { align: 'center' });
  y += 17;

  // Legend
  head('Legend');
  const legend = readLegend();
  const row = (drawSym, label) => { drawSym(px + 1, y); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.8); doc.setTextColor(...INK); doc.text(ascii(label), px + 13, y + 2.3); y += 5.6; };
  for (const part of legend) {
    if (!part.canvas) continue;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.8); doc.setTextColor(...INK); doc.text(ascii(part.title), px, y + 1.6); y += 3.6;
    doc.addImage(part.canvas.toDataURL('image/png'), 'PNG', px, y, pw - 2, 4);
    doc.setDrawColor(...INK); doc.setLineWidth(0.2); doc.rect(px, y, pw - 2, 4);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
    for (const tk of part.ticks) {
      const tx = px + clamp(tk.at, 0, 1) * (pw - 2);
      doc.line(tx, y + 4, tx, y + 5.2);
      doc.text(ascii(tk.text), clamp(tx, px + 3, px + pw - 5), y + 8.2, { align: 'center' });
    }
    y += 11.5;
  }
  const s = view.seen;
  const line = (col, w, dash) => (x, yy) => { doc.setDrawColor(...col); doc.setLineWidth(w); if (dash) doc.setLineDashPattern(dash, 0); doc.line(x, yy + 1.2, x + 9, yy + 1.2); doc.setLineDashPattern([], 0); };
  const dot = (col, r, ring) => (x, yy) => { doc.setFillColor(...col); if (ring) { doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.5); doc.circle(x + 4.5, yy + 1.2, r, 'FD'); } else doc.circle(x + 4.5, yy + 1.2, r, 'F'); };
  if (s.aoi) row((x, yy) => { doc.setDrawColor(0, 113, 227); doc.setLineWidth(0.4); doc.setLineDashPattern([1.2, 0.9], 0); doc.rect(x + 0.5, yy - 0.4, 8, 3.2); doc.setLineDashPattern([], 0); }, 'Analysis area');
  if (s.streams) row(line(BLUE, 0.7), 'Stream network (thicker = bigger catchment)');
  if (s.exposure) row(dot([240, 59, 32], 0.9), 'Buildings and places, coloured by flood chance');
  if (s.marks) row(dot([224, 48, 30], 1.5, true), 'Flood mark (depth reached before)');
  if (s.route) row(line([36, 138, 61], 1.1), 'Safe route on foot');
  if (s.me) row(dot([0, 113, 227], 1.5, true), 'Your location');
  if (!legend.length && !Object.values(s).some(Boolean)) { doc.setFont('helvetica', 'italic'); doc.setFontSize(7.8); doc.setTextColor(...GREY); doc.text('Base map only. Run an analysis to add flood layers.', px, y + 2); y += 6; }
  y += 3;

  // Map information, as a ruled table.
  head('Map information');
  const sc = ctx.state.scenario;
  const rows = [
    ['Scenario', sc ? (sc.mode === 'stage' ? `River rise of ${(+sc.params.stage).toFixed(1)} m` : `Rain of ${Math.round(sc.params.P24)} mm in 24 h`) : 'No flood scenario run'],
    ['Centre', dmsFull(view.center.lat, view.center.lng)],
    ['Projection', 'Web Mercator (EPSG:3857)'],
    ['Datum', 'WGS 84'],
    ['Resolution', `${opts.dpi} dpi, A3 landscape`],
  ];
  doc.setFontSize(7.4);
  rows.forEach(([a, b], i) => {
    doc.setDrawColor(...RULE); doc.setLineWidth(0.12); if (i) doc.line(px, y - 3.4, px + pw, y - 3.4);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...GREY); doc.text(a, px, y);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...INK);
    const lines = doc.splitTextToSize(ascii(b), pw - 22);
    doc.text(lines, px + 22, y); y += 4.6 + (lines.length - 1) * 3.2;
  });
  y += 1;

  // Locator inset (needs room: skip if the panel is already full).
  const insH = 44;
  const sources = [...new Set(view.tiles.map((l) => strip(l.options.attribution)).filter(Boolean))];
  const srcText = [
    ...sources,
    'Terrain: AWS Terrain Tiles (SRTM and other surveys).',
    'Rivers and places: OpenStreetMap contributors.',
    'Flood analysis: Flood Depth, a terrain-only model.',
  ].map(ascii);
  doc.setFontSize(6.2);
  const srcLines = doc.splitTextToSize(srcText.join('  '), pw);
  const srcH = srcLines.length * 2.6 + 18;
  if (inset && y + insH + 9 + srcH < bottom) {
    head('Location');
    doc.addImage(inset.toDataURL('image/jpeg', 0.9), 'JPEG', px, y, pw, insH, undefined, 'FAST');
    doc.setDrawColor(...INK); doc.setLineWidth(0.3); doc.rect(px, y, pw, insH);
    doc.setFontSize(6.2); doc.setTextColor(...GREY); doc.setFont('helvetica', 'normal');
    doc.text('Red box: area on this sheet', px + 1.5, y + insH - 1.6);
    y += insH + 4;
  }

  // Sources and the honest note, pinned to the foot of the panel.
  const fy = bottom - srcH + 2;
  doc.setDrawColor(...INK); doc.setLineWidth(0.5); doc.line(px, fy, px + pw, fy);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...INK); doc.text('SOURCES AND LIMITS', px, fy + 4);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.2); doc.setTextColor(...GREY);
  doc.text(srcLines, px, fy + 7.6);
  const ly = fy + 7.6 + srcLines.length * 2.6;
  doc.setTextColor(...INK);
  doc.text(doc.splitTextToSize('This is a guide to where water is likely to go. Depths are rough, and it cannot see drains, culverts or dams. Follow official warnings first.', pw), px, ly + 1.2);

  // Footer line under the frame
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8); doc.setTextColor(...GREY);
  doc.text(`Made with Flood Depth  |  ${location.hostname || 'flood depth'}  |  ${dateTxt}`, 20, PH - 11.2);
}

// ---------- Entry point ----------
let busy = false;
export function initQuickMap(ctx) {
  async function run() {
    if (busy) return;
    busy = true;
    const phone = ctx.isPhone?.();
    ctx.toast('Making your map. This takes a few seconds...', false);
    try {
      const JsPDF = await loadJsPdf();
      const dpi = phone ? 200 : 300;
      const PW = 420, PH = 297;
      const frame = { x: 22, y: 41, w: 286, h: 238 };
      const panel = { x: 322, w: 84 };
      const W = Math.round((frame.w * dpi) / 25.4), H = Math.round((frame.h * dpi) / 25.4);
      const view = await renderMap(ctx, W, H, dpi, (p) => ctx.toast(`Making your map... ${Math.round(p * 100)}%`, false));
      view.canvasW = W; view.canvasH = H;
      ctx.toast('Adding the sheet furniture...', false);
      let inset = null;
      try { inset = await renderInset(ctx, view, 900, 600); } catch { inset = null; }
      const doc = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3', compress: true });
      sheet(doc, ctx, view, view.canvas, inset, { frame, panel, dpi, PW, PH });
      const name = (ctx.areaName() || 'map').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'map';
      doc.save(`flood-depth-${name}-${new Date().toISOString().slice(0, 10)}.pdf`);
      ctx.toast('Your map is ready: check your downloads.', false, 4500);
    } catch (err) {
      console.error(err);
      ctx.toast(err?.message || 'Could not make the map.', true);
    } finally { busy = false; }
  }
  ctx.quickMap = run;
}
