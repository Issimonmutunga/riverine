// Quick map: one tap makes a high-resolution A3 PDF of what is on the map, laid out like a printed
// topographic sheet from East and South-East Asia (Japan's GSI, Korea's NGII, Singapore, China's standard
// map sheets): a double neatline, a plain thin frame with small pale degree-minute labels, a ruled title block,
// a legend panel, a bar scale, a locator inset and a plain list of sources. Everything on screen is redrawn
// onto a large canvas (tiles, flood rasters, rivers, buildings, marks), so the print matches the screen.

const JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
const INK = [27, 31, 36], GREY = [110, 116, 124], RULE = [150, 156, 164], PALE = [236, 238, 241], BLUE = [11, 61, 145];

// A quiet light-grey base (OpenStreetMap-derived) with no labels, so the flood colours are the focal point. The
// labels are a separate layer drawn ABOVE the flood layer, with white halos and only the major names.
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas';
const PRINT_BASE = [
  { _url: `${ESRI}/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`, options: { maxNativeZoom: 16, zIndex: 1, subdomains: '', attribution: 'Base map (c) Esri, HERE, Garmin, OpenStreetMap contributors' } },
];
const PRINT_LABELS = [
  { _url: `${ESRI}/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, options: { maxNativeZoom: 16, zIndex: 3, subdomains: '' } },
];

const INSET_H = 44;

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
/** The area the active layers cover: the flood and terrain rasters, or the analysis box when there are none. */
function activeBounds(map, state) {
  const shown = Object.values(map._layers).filter((l) => l instanceof L.ImageOverlay && l._image && l._image.naturalWidth);
  let lb = null;
  for (const l of shown) { const b = l.getBounds(); lb = lb ? lb.extend(b) : L.latLngBounds(b.getSouthWest(), b.getNorthEast()); }
  if (!lb && state.aoiRect && map.hasLayer(state.aoiRect)) lb = state.aoiRect.getBounds();
  return lb;
}
/** Width over height of those bounds, measured on the map itself (Web Mercator pixels). */
function boundsAspect(map, lb) {
  const crs = map.options.crs, nw = crs.latLngToPoint(lb.getNorthWest(), 0), se = crs.latLngToPoint(lb.getSouthEast(), 0);
  return Math.max(1e-6, se.x - nw.x) / Math.max(1e-6, se.y - nw.y);
}

const flatRings = (ll) => (ll.length && ll[0] && ll[0].lat !== undefined ? [ll] : ll.flatMap(flatRings));

async function renderMap(ctx, W, H, dpi, onProgress) {
  const { map, state } = ctx;
  const size = map.getSize();
  if (!size.x || !size.y) throw new Error('The map is not visible right now. Show the map and try again.');
  const crs = map.options.crs;
  const all = Object.values(map._layers);

  // Frame the sheet on the active layers so they fill at least 80% of the map area. Without an analysis the
  // sheet simply shows what is on screen.
  const lb = activeBounds(map, state);
  let zp, centerLL, cropped = false;
  if (lb) {
    const nw0 = crs.latLngToPoint(lb.getNorthWest(), 0), se0 = crs.latLngToPoint(lb.getSouthEast(), 0);
    const bw0 = Math.max(1e-6, se0.x - nw0.x), bh0 = Math.max(1e-6, se0.y - nw0.y);
    const zFit = Math.log2(Math.min(W / bw0, H / bh0) * 0.97);                       // whole area inside the frame
    const zCover = 0.5 * Math.log2((0.8 * W * H) / (bw0 * bh0));                     // area just reaches 80% of the frame
    zp = Math.max(zFit, zCover);
    cropped = zCover > zFit + 1e-6;                                                  // odd shapes: the long edges run off the sheet
    centerLL = lb.getCenter();
  } else {
    zp = map.getZoom() + Math.log2(Math.min(W / size.x, H / size.y));
    centerLL = map.getCenter();
  }
  const scale = Math.min(2 ** (zp - map.getZoom()), (W / size.x) * 1.2);             // print pixels per screen pixel, for line weights
  const center = crs.latLngToPoint(centerLL, zp);
  const tlx = center.x - W / 2, tly = center.y - H / 2;
  const P = (ll) => { const p = crs.latLngToPoint(ll, zp); return [p.x - tlx, p.y - tly]; };
  const k = scale * 0.85;                                    // line widths and symbols, in print pixels

  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const c = canvas.getContext('2d');
  c.fillStyle = '#eef0f2'; c.fillRect(0, 0, W, H);

  const tiles = PRINT_BASE;
  let done = 0, total = 1;
  total = Math.max(1, tiles.length * 40);
  await drawTiles(c, map, tiles, zp, tlx, tly, W, H, () => onProgress(Math.min(0.9, ++done / total)));

  const seen = { aoi: false, streams: false, exposure: false, marks: false, me: false, route: false, hospital: false, school: false, station: false, bridge: false };

  // Draw order, bottom to top: terrain rasters, rivers, the flood layer, then the rest.
  const images = all.filter((l) => l instanceof L.ImageOverlay && l._image).sort((a, b) => (a.options.zIndex || 0) - (b.options.zIndex || 0));
  const drawImage = (l) => {
    const img = l._image;
    if (!img.complete || !img.naturalWidth) return;
    const bb = l.getBounds(), nw = P(bb.getNorthWest()), se = P(bb.getSouthEast());
    c.save();
    c.globalAlpha = l.options.opacity ?? 1;
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.drawImage(img, nw[0], nw[1], se[0] - nw[0], se[1] - nw[1]);
    c.restore();
  };
  const isFlood = (l) => (l.options.zIndex || 0) >= 230;
  images.filter((l) => !isFlood(l)).forEach(drawImage);

  const strokeOf = (o) => {
    c.lineWidth = Math.max(0.5, (o.weight ?? 3) * k);
    c.strokeStyle = o.color || '#3388ff';
    c.globalAlpha = o.opacity ?? 1;
    c.lineCap = o.lineCap || 'round'; c.lineJoin = o.lineJoin || 'round';
    c.setLineDash(o.dashArray ? String(o.dashArray).split(/[ ,]+/).map((v) => +v * k) : []);
  };
  const mpp = (lat) => (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (256 * 2 ** zp);

  // Vectors. Rivers go UNDER the flood layer, thin and soft, so the depth shows inside the channels.
  const paths = all.filter((l) => l instanceof L.Polyline && !(l instanceof L.CircleMarker));
  const drawPath = (l) => {
    const o0 = l.options;
    const isStream = o0.color === '#0b3d91';
    const o = isStream ? { ...o0, weight: Math.max(0.6, (o0.weight ?? 3) * 0.42), opacity: 0.55 } : o0;
    if (l === state.aoiRect) return;                       // the analysis box is drawn on its own, below
    if (isStream) seen.streams = true; else if (o.color === '#248a3d') seen.route = true;
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
  };
  const isStreamPath = (l) => l.options.color === '#0b3d91';
  paths.filter(isStreamPath).forEach(drawPath);
  images.filter(isFlood).forEach(drawImage);
  paths.filter((l) => !isStreamPath(l)).forEach(drawPath);

  // The analysis area: dim everything outside it, then a charcoal dashed boundary.
  if (state.aoiRect && map.hasLayer(state.aoiRect)) {
    seen.aoi = true;
    const bb = state.aoiRect.getBounds(), nw = P(bb.getNorthWest()), se = P(bb.getSouthEast());
    c.save();
    c.fillStyle = 'rgba(30,34,40,0.20)';
    c.beginPath(); c.rect(0, 0, W, H); c.rect(nw[0], nw[1], se[0] - nw[0], se[1] - nw[1]); c.fill('evenodd');
    c.strokeStyle = '#2d3138'; c.lineWidth = 2.4 * k; c.setLineDash([9 * k, 6 * k]); c.lineJoin = 'miter';
    c.strokeRect(nw[0], nw[1], se[0] - nw[0], se[1] - nw[1]);
    c.restore();
  }

  // Labels above the flood layer (white halos are built into these tiles).
  await drawTiles(c, map, PRINT_LABELS, zp, tlx, tly, W, H, () => {});

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
  // Hospitals, schools, railway stations and major bridges that sit inside the flood zone.
  onProgress(0.93);
  let assets = [];
  try { assets = await findAssets(ctx, lb, images.filter(isFlood), P, W, H); } catch { assets = []; }
  const haloText = (text, x, y, size) => {
    c.font = `700 ${Math.round(size)}px Helvetica, Arial, sans-serif`; c.lineJoin = 'round';
    c.lineWidth = size * 0.32; c.strokeStyle = 'rgba(255,255,255,.96)'; c.strokeText(text, x, y);
    c.fillStyle = '#1b1f24'; c.fillText(text, x, y);
  };
  const KIND = { hospital: ['#c1121f', 'H'], school: ['#a15c00', 'S'], station: ['#5b3cc4', 'R'], bridge: ['#2d3138', '='] };
  for (const a of assets) {
    const [x, y] = P(L.latLng(a.lat, a.lon)); const [col, ch] = KIND[a.kind];
    seen[a.kind] = true;
    const r = 6.2 * k;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 1.6 * k; c.strokeStyle = col; c.stroke();
    c.fillStyle = col; c.font = `800 ${Math.round(8.4 * k)}px Helvetica, Arial, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(ch, x, y + 0.4 * k); c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    if (a.name && (a.kind === 'hospital' || a.kind === 'station')) haloText(a.name.length > 26 ? a.name.slice(0, 25) + '.' : a.name, x + r + 2.5 * k, y + 3.4 * k, 9.4 * k);
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
  return { canvas, zp, scale, crs, tlx, tly, seen, tiles, cropped, mpp: mpp(centerLL.lat), center: centerLL };
}

/** Where is a point on the flood layer? Alpha of the flood rasters, sampled on a small copy. */
function floodSampler(floodImages, P, W, H) {
  const f = 4, w = Math.ceil(W / f), h = Math.ceil(H / f);
  const cv = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const g = cv.getContext('2d', { willReadFrequently: true });
  for (const l of floodImages) {
    const img = l._image; if (!img || !img.naturalWidth) continue;
    const bb = l.getBounds(), nw = P(bb.getNorthWest()), se = P(bb.getSouthEast());
    g.drawImage(img, nw[0] / f, nw[1] / f, (se[0] - nw[0]) / f, (se[1] - nw[1]) / f);
  }
  const data = g.getImageData(0, 0, w, h).data;
  return (x, y) => { const ix = Math.floor(x / f), iy = Math.floor(y / f); return ix >= 0 && iy >= 0 && ix < w && iy < h && data[(iy * w + ix) * 4 + 3] > 24; };
}
/** Key public assets inside the flood zone, from OpenStreetMap. Quietly gives nothing if the service is slow. */
async function findAssets(ctx, lb, floodImages, P, W, H) {
  if (!lb || !floodImages.length || !ctx.overpass) return [];
  const bb = `${lb.getSouth().toFixed(5)},${lb.getWest().toFixed(5)},${lb.getNorth().toFixed(5)},${lb.getEast().toFixed(5)}`;
  const q = `[out:json][timeout:30];(nwr["amenity"~"^(hospital|clinic)$"](${bb});nwr["amenity"~"^(school|college|university)$"](${bb});node["railway"~"^(station|halt)$"](${bb});way["bridge"="yes"]["highway"~"^(motorway|trunk|primary|secondary)$"](${bb}););out center 1500;`;
  const data = await Promise.race([ctx.overpass(q, 12000), new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 20000))]);
  const inZone = floodSampler(floodImages, P, W, H);
  const seenName = new Set(), out = [];
  for (const el of data.elements || []) {
    const t = el.tags || {}, lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;
    const kind = /hospital|clinic/.test(t.amenity || '') ? 'hospital' : /school|college|university/.test(t.amenity || '') ? 'school' : t.railway ? 'station' : t.bridge ? 'bridge' : null;
    if (!kind) continue;
    const [x, y] = P(L.latLng(lat, lon));
    if (x < 0 || y < 0 || x > W || y > H || !inZone(x, y)) continue;
    const key = `${kind}:${t.name || ''}`;
    if (t.name && seenName.has(key)) continue;
    seenName.add(key);
    out.push({ kind, lat, lon, name: t.name || '' });
  }
  const cap = { hospital: 30, station: 15, bridge: 12, school: 25 }, n = { hospital: 0, station: 0, bridge: 0, school: 0 };
  const rank = { hospital: 0, station: 1, bridge: 2, school: 3 };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind]).filter((a) => (n[a.kind] += 1) <= cap[a.kind]);
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
  const { frame, panel, dpi, region } = opts;
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

  // Title block: kept minimal. The place name, one quiet line under it, and the scale and date at the right.
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(17);
  doc.text(title.length > 46 ? `${title.slice(0, 44)}...` : title, 20, 19);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GREY);
  doc.text('Flood exposure guide. Not an official warning.', 20, 24.2);
  doc.setFontSize(8); doc.setTextColor(...INK);
  doc.text(`1 : ${ratio.toLocaleString('en-GB')}`, panel.x + panel.w, 19, { align: 'right' });
  doc.setFontSize(7.5); doc.setTextColor(...GREY);
  doc.text(dateTxt, panel.x + panel.w, 24.2, { align: 'right' });
  doc.setDrawColor(...RULE); doc.setLineWidth(0.25); doc.line(20, 27.4, panel.x + panel.w, 27.4);

  // The map, with a hairline frame.
  doc.addImage(mapCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', frame.x, frame.y, frame.w, frame.h, undefined, 'FAST');

  // Frame and coordinate labels: the degree-minute positions of the frame edges.
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
  // A plain thin frame. Coordinates are only small, pale labels with a tiny tick each: present for anyone who
  // needs them, quiet for everyone else (no grid lines across the map, no striped ruler).
  const RW = 1.4;
  doc.setDrawColor(...INK); doc.setLineWidth(0.35); doc.rect(frame.x, frame.y, frame.w, frame.h);
  doc.setDrawColor(...RULE); doc.setLineWidth(0.15);
  lonX.forEach((x) => { doc.line(x, frame.y - RW, x, frame.y); doc.line(x, frame.y + frame.h, x, frame.y + frame.h + RW); });
  latY.forEach((y) => { doc.line(frame.x - RW, y, frame.x, y); doc.line(frame.x + frame.w, y, frame.x + frame.w + RW, y); });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(5.6); doc.setTextColor(...RULE);
  lons.forEach((v, i) => {
    const x = lonX[i], t = dms(v, lonStep, 'lon');
    doc.text(t, x, frame.y - RW - 0.9, { align: 'center' });
    doc.text(t, x, frame.y + frame.h + RW + 2.4, { align: 'center' });
  });
  lats.forEach((v, i) => {
    const y = latY[i], t = dms(v, latStep, 'lat');
    doc.text(t, frame.x - RW - 0.9, y + 0.7, { align: 'right' });
    doc.text(t, frame.x + frame.w + RW + 0.9, y + 0.7, { align: 'left' });
  });

  // ---- Right-hand panel ----
  // Every block is measured before it is drawn, so text can never run into the next block or off the sheet.
  const px = panel.x, pw = panel.w, top = region.y, bottom = region.y + region.h;
  let y = top;
  const head = (txt) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.6); doc.setTextColor(...INK); doc.setCharSpace(0.8);
    doc.text(txt.toUpperCase(), px, y + 3.4); doc.setCharSpace(0);
    doc.setDrawColor(...INK); doc.setLineWidth(0.45); doc.line(px, y + 4.8, px + pw, y + 4.8);
    y += 8.4;
  };
  /** Wrapped small text with explicit line spacing. Wraps a little narrower than the box, so a viewer that
   *  substitutes a wider font still keeps every word inside. */
  const para = (text, size, color, x, width, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size);
    const lines = doc.splitTextToSize(ascii(text), width * 0.9), lh = size * 0.42;
    return { lines, lh, h: lines.length * lh, draw(yy) { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...color); lines.forEach((ln, i) => doc.text(ln, x, yy + (i + 0.8) * lh)); } };
  };

  // Scale and north, grouped: the bar and its fraction on the left, the arrow beside them.
  head('Scale and north');
  const barM = niceDistance(metersPerMm * 38), barMm = barM / metersPerMm, segs = 4, x0 = px + 0.5;
  for (let i = 0; i < segs; i++) {
    doc.setFillColor(...(i % 2 ? [255, 255, 255] : INK)); doc.setDrawColor(...INK); doc.setLineWidth(0.25);
    doc.rect(x0 + (barMm / segs) * i, y + 1, barMm / segs, 2.4, 'FD');
  }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.6); doc.setTextColor(...INK);
  for (let i = 0; i <= segs; i++) {
    const v = (barM / segs) * i;
    doc.text(i === segs ? fmtDist(v) : String(v >= 1000 ? +(v / 1000).toFixed(2) : v), x0 + (barMm / segs) * i, y + 7, { align: 'center' });
  }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.4); doc.setTextColor(...INK);
  doc.text(`1 : ${ratio.toLocaleString('en-GB')}`, x0, y + 11.6);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.6); doc.setTextColor(...GREY);
  doc.text(`1 cm = ${fmtDist(Math.round(metersPerMm * 10))}`, x0 + 22, y + 11.6);
  const nx = px + pw - 6.5, ny = y + 0.4;
  doc.setFillColor(...INK); doc.setDrawColor(...INK); doc.setLineWidth(0.25);
  doc.triangle(nx, ny, nx - 2.8, ny + 8, nx, ny + 6, 'FD');
  doc.setFillColor(255, 255, 255); doc.triangle(nx, ny, nx + 2.8, ny + 8, nx, ny + 6, 'FD');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...INK); doc.text('N', nx, ny + 11.6, { align: 'center' });
  y += 15.5;

  // Legend
  head('Legend');
  const legend = readLegend();
  for (const part of legend) {
    if (!part.canvas) continue;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.4); doc.setTextColor(...INK); doc.text(ascii(part.title), px, y + 1.6); y += 3.4;
    const bw = pw - 1;
    doc.addImage(part.canvas.toDataURL('image/png'), 'PNG', px, y, bw, 3.8);
    doc.setDrawColor(...INK); doc.setLineWidth(0.2); doc.rect(px, y, bw, 3.8);
    // Minimum, a middle value and the maximum, each directly under its place on the bar.
    const tk = [...part.ticks].sort((m, n) => m.at - n.at);
    const first = tk[0], last = tk[tk.length - 1];
    const mid = tk.slice(1, -1).sort((m, n) => Math.abs(m.at - 0.5) - Math.abs(n.at - 0.5))[0];
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8); doc.setTextColor(...INK); doc.setDrawColor(...INK); doc.setLineWidth(0.2);
    const mark = (t, align) => {
      if (!t) return;
      const tx = px + clamp(t.at, 0, 1) * bw;
      doc.line(tx, y + 3.8, tx, y + 4.8);
      doc.text(ascii(t.text), align === 'left' ? px : align === 'right' ? px + bw : tx, y + 7.4, { align });
    };
    mark(first, 'left'); mark(mid, 'center'); if (last !== first) mark(last, 'right');
    y += 10.6;
  }
  const s = view.seen;
  const symRow = (drawSym, label) => { drawSym(px, y); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.4); doc.setTextColor(...INK); doc.text(ascii(label), px + 11, y + 2.1); y += 5.2; };
  const line = (col, w) => (x, yy) => { doc.setDrawColor(...col); doc.setLineWidth(w); doc.line(x, yy + 1.2, x + 8, yy + 1.2); };
  const dot = (col, r, ring) => (x, yy) => { doc.setFillColor(...col); if (ring) { doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.5); doc.circle(x + 4, yy + 1.2, r, 'FD'); } else doc.circle(x + 4, yy + 1.2, r, 'F'); };
  const badge = (col, ch) => (x, yy) => {
    doc.setFillColor(255, 255, 255); doc.setDrawColor(...col); doc.setLineWidth(0.4); doc.circle(x + 4, yy + 1.2, 2, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6); doc.setTextColor(...col); doc.text(ch, x + 4, yy + 2, { align: 'center' });
  };
  if (s.aoi) symRow((x, yy) => { doc.setDrawColor(45, 49, 56); doc.setLineWidth(0.4); doc.setLineDashPattern([1.2, 0.9], 0); doc.rect(x, yy - 0.2, 8, 3); doc.setLineDashPattern([], 0); }, 'Analysis area (outside is dimmed)');
  if (s.streams) symRow(line([31, 78, 153], 0.5), 'Streams (drawn under the flood)');
  if (s.exposure) symRow(dot([240, 59, 32], 0.9), 'Buildings, coloured by flood chance');
  if (s.hospital) symRow(badge([193, 18, 31], 'H'), 'Hospital or clinic in the flood zone');
  if (s.school) symRow(badge([161, 92, 0], 'S'), 'School or college in the flood zone');
  if (s.station) symRow(badge([91, 60, 196], 'R'), 'Railway station in the flood zone');
  if (s.bridge) symRow(badge([45, 49, 56], '='), 'Major bridge in the flood zone');
  if (s.marks) symRow(dot([224, 48, 30], 1.5, true), 'Flood mark (depth reached before)');
  if (s.route) symRow(line([36, 138, 61], 1.1), 'Safe route on foot');
  if (s.me) symRow(dot([0, 113, 227], 1.5, true), 'Your location');
  if (!legend.length && !Object.values(s).some(Boolean)) { y += 0.5; const t = para('Base map only. Run an analysis to add flood layers.', 7.4, GREY, px, pw); t.draw(y); y += t.h + 1; }
  y += 2.5;

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
  rows.forEach(([k, v], i) => {
    const t = para(v, 7.2, INK, px + 21, pw - 21);
    const h = Math.max(4.4, t.h + 1.6);
    if (i) { doc.setDrawColor(...RULE); doc.setLineWidth(0.12); doc.line(px, y, px + pw, y); }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.2); doc.setTextColor(...GREY); doc.text(k, px, y + 3.2);
    t.draw(y + 0.6);
    y += h;
  });
  y += 3;

  // Sources and limits: measured first, pinned to the foot of the panel.
  const sourceItems = [
    ...new Set(view.tiles.map((l) => strip(l.options.attribution)).filter(Boolean)),
    'Labels: Esri, HERE, Garmin, OpenStreetMap contributors.',
    'Terrain: AWS Terrain Tiles (SRTM and other surveys).',
    'Rivers, places and public assets: OpenStreetMap contributors.',
    'Flood analysis: Flood Depth, a terrain-only model.',
  ];
  const srcParas = sourceItems.map((t) => para(t, 6.2, GREY, px, pw));
  const note = para('A guide to where water is likely to go. Depths are rough, and it cannot see drains, culverts or dams. Follow official warnings first.', 6.4, INK, px, pw, true);
  const srcH = srcParas.reduce((n, q) => n + q.h + 0.9, 0);
  const footH = 8.4 + srcH + 1.5 + note.h + 1;
  const footTop = bottom - footH;

  // Location inset: a complete picture, with its caption underneath (never on top of it).
  const insH = INSET_H, locH = 8.4 + insH + 5;
  if (inset && y + locH <= footTop - 2) {
    head('Location');
    doc.addImage(inset.toDataURL('image/jpeg', 0.9), 'JPEG', px, y, pw, insH, undefined, 'FAST');
    doc.setDrawColor(...INK); doc.setLineWidth(0.3); doc.rect(px, y, pw, insH);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.4); doc.setTextColor(...GREY);
    doc.text('Red box: the area shown on this sheet', px, y + insH + 3.4);
    y += insH + 5;
  }

  y = footTop;
  head('Sources and limits');
  srcParas.forEach((q) => { q.draw(y); y += q.h + 0.9; });
  y += 1.5;
  note.draw(y);

  // Footer line under the frame
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8); doc.setTextColor(...GREY);
  doc.text(`Made with Flood Depth  |  ${location.hostname || 'flood depth'}  |  ${dateTxt}${view.cropped ? '  |  The analysis area is larger than the frame at this shape; its outer edges run off the sheet.' : ''}`, 20, PH - 11.2);
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
      // The frame takes the proportions of the active layers, so they fill it in both directions.
      const region = { x: 22, y: 36, w: 286, h: 243 };
      let frame = { ...region };
      const lb = activeBounds(ctx.map, ctx.state);
      if (lb) {
        const asp = clamp(boundsAspect(ctx.map, lb), 0.6, 2.2);
        const fw = asp >= region.w / region.h ? region.w : region.h * asp, fh = asp >= region.w / region.h ? region.w / asp : region.h;
        frame = { x: region.x + (region.w - fw) / 2, y: region.y + (region.h - fh) / 2, w: fw, h: fh };
      }
      const panel = { x: 324, w: 82 };
      const W = Math.round((frame.w * dpi) / 25.4), H = Math.round((frame.h * dpi) / 25.4);
      const view = await renderMap(ctx, W, H, dpi, (p) => ctx.toast(`Making your map... ${Math.round(p * 100)}%`, false));
      view.canvasW = W; view.canvasH = H;
      ctx.toast('Adding the sheet furniture...', false);
      let inset = null;
      try { inset = await renderInset(ctx, view, 900, Math.round((900 * INSET_H) / panel.w)); } catch { inset = null; }
      const doc = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3', compress: true });
      sheet(doc, ctx, view, view.canvas, inset, { frame, panel, dpi, PW, PH, region });
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
