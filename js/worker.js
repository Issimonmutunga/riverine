// Flood Depths analysis worker: loads a DEM onto a Web-Mercator pixel grid, runs the
// terrain/hydrology pipeline once, then answers fast flood-scenario queries.
import * as G from './geo.js';
import * as Hy from './hydro.js';

const MAX_CELLS = 2_200_000;
const TERRARIUM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';

let S = null; // analysis state

const progress = (msg, pct) => postMessage({ type: 'progress', msg, pct });

self.onmessage = async (ev) => {
  const m = ev.data;
  try {
    if (m.type === 'analyze') await analyze(m);
    else if (m.type === 'scenario') scenario(m);
    else if (m.type === 'sample') sample(m);
    else if (m.type === 'export') exportLayer(m);
  } catch (err) {
    postMessage({ type: 'error', id: m.id, message: err.message || String(err) });
  }
};

// ---------------- Grid definition ----------------
function gridFor(bbox, z) {
  const x0 = Math.floor(G.lonToPx(bbox.w, z)), x1 = Math.ceil(G.lonToPx(bbox.e, z));
  const y0 = Math.floor(G.latToPx(bbox.n, z)), y1 = Math.ceil(G.latToPx(bbox.s, z));
  return { z, x0, y0, W: x1 - x0, H: y1 - y0 };
}

function pickZoom(bbox, zmax, zmin = 8) {
  for (let z = zmax; z >= zmin; z--) {
    const g = gridFor(bbox, z);
    if (g.W * g.H <= MAX_CELLS) return g;
  }
  throw new Error('Area is too large. Draw a smaller area (roughly under 150 × 150 km).');
}

// ---------------- DEM sources ----------------
async function decodeTile(z, tx, ty) {
  const n = 2 ** z;
  if (ty < 0 || ty >= n) return null;
  const wx = ((tx % n) + n) % n;
  const res = await fetch(`${TERRARIUM}/${z}/${wx}/${ty}.png`);
  if (!res.ok) throw new Error(`Terrain tile ${z}/${wx}/${ty} failed (${res.status})`);
  const bmp = await createImageBitmap(await res.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const cv = new OffscreenCanvas(G.TILE, G.TILE);
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  return ctx.getImageData(0, 0, G.TILE, G.TILE).data;
}

async function loadTerrarium(g) {
  const { z, x0, y0, W, H } = g;
  const elev = new Float32Array(W * H).fill(NaN);
  const tx0 = Math.floor(x0 / G.TILE), tx1 = Math.floor((x0 + W - 1) / G.TILE);
  const ty0 = Math.floor(y0 / G.TILE), ty1 = Math.floor((y0 + H - 1) / G.TILE);
  const jobs = [];
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) jobs.push([tx, ty]);
  let done = 0;
  const worker = async () => {
    while (jobs.length) {
      const [tx, ty] = jobs.shift();
      const px = await decodeTile(z, tx, ty);
      done++;
      progress(`Downloading terrain tiles ${done}/${(tx1 - tx0 + 1) * (ty1 - ty0 + 1)}`, 5 + 25 * done / ((tx1 - tx0 + 1) * (ty1 - ty0 + 1)));
      if (!px) continue;
      for (let j = 0; j < G.TILE; j++) {
        const r = ty * G.TILE + j - y0;
        if (r < 0 || r >= H) continue;
        for (let i = 0; i < G.TILE; i++) {
          const c = tx * G.TILE + i - x0;
          if (c < 0 || c >= W) continue;
          const o = (j * G.TILE + i) * 4;
          elev[r * W + c] = px[o] * 256 + px[o + 1] + px[o + 2] / 256 - 32768;
        }
      }
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  return elev;
}

function resampleUpload(up, g) {
  const T = G.crsTransforms(up.epsg);
  const { z, x0, y0, W, H } = g;
  const [minX, minY, maxX, maxY] = up.bbox;
  const resX = (maxX - minX) / up.width, resY = (maxY - minY) / up.height;
  const src = up.data, sw = up.width, sh = up.height, nd = up.nodata;
  const ok = (v) => Number.isFinite(v) && v !== nd && v > -1e4 && v < 1e4;
  const elev = new Float32Array(W * H).fill(NaN);
  for (let r = 0; r < H; r++) {
    const lat = G.pxToLat(y0 + r + 0.5, z);
    for (let c = 0; c < W; c++) {
      const lon = G.pxToLon(x0 + c + 0.5, z);
      const [sx, sy] = T.fwd(lat, lon);
      const fc = (sx - minX) / resX - 0.5, fr = (maxY - sy) / resY - 0.5;
      const c0 = Math.floor(fc), r0 = Math.floor(fr);
      if (c0 < -1 || r0 < -1 || c0 >= sw || r0 >= sh) continue;
      const tc = fc - c0, tr = fr - r0;
      let sum = 0, wsum = 0;
      for (let dr = 0; dr <= 1; dr++) for (let dc = 0; dc <= 1; dc++) {
        const rr = r0 + dr, cc = c0 + dc;
        if (rr < 0 || cc < 0 || rr >= sh || cc >= sw) continue;
        const v = src[rr * sw + cc];
        if (!ok(v)) continue;
        const w = (dr ? tr : 1 - tr) * (dc ? tc : 1 - tc);
        sum += v * w; wsum += w;
      }
      if (wsum > 0.25) elev[r * W + c] = sum / wsum;
    }
  }
  return elev;
}

function uploadExtent(up) {
  const T = G.crsTransforms(up.epsg);
  if (!T) throw new Error(`Unsupported CRS EPSG:${up.epsg}. Reproject the DEM to EPSG:4326 or a WGS84 UTM zone (e.g. in QGIS: Raster ▸ Projections ▸ Warp).`);
  const [minX, minY, maxX, maxY] = up.bbox;
  let w = 180, e = -180, s = 90, n = -90;
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
    const [lat, lon] = T.inv(minX + (maxX - minX) * i / 4, minY + (maxY - minY) * j / 4);
    w = Math.min(w, lon); e = Math.max(e, lon); s = Math.min(s, lat); n = Math.max(n, lat);
  }
  const latc = (s + n) / 2;
  const geographic = up.epsg === 4326 || up.epsg === 4269 || up.epsg === 4258;
  let srcRes = (maxX - minX) / up.width;
  if (geographic) srcRes *= 111320 * Math.cos(latc * Math.PI / 180);
  else if (up.epsg === 3857) srcRes *= Math.cos(latc * Math.PI / 180);
  let z = 8;
  for (let k = 17; k >= 8; k--) {
    if (G.mercRes(k) * Math.cos(latc * Math.PI / 180) >= srcRes * 0.9) { z = k; break; }
  }
  return { bbox: { w, s, e, n }, z, srcRes, crsName: T.name };
}

// ---------------- Main analysis ----------------
async function analyze(m) {
  const t0 = performance.now();
  let g, elev, source;
  if (m.source === 'upload') {
    progress('Reading uploaded DEM', 5);
    const ext = uploadExtent(m.upload);
    g = pickZoom(ext.bbox, ext.z);
    elev = resampleUpload(m.upload, g);
    source = `Uploaded DEM · ${ext.crsName} · native ≈${ext.srcRes.toFixed(1)} m`;
  } else {
    g = pickZoom(m.bbox, m.zmax);
    progress('Downloading terrain tiles', 5);
    elev = await loadTerrarium(g);
    source = 'AWS Terrain Tiles (SRTM / GMTED / ETOPO1 / NED composite)';
  }
  const { z, x0, y0, W, H } = g;
  const N = W * H;
  const latc = G.pxToLat(y0 + H / 2, z);
  const rowScale = new Float64Array(H);
  for (let r = 0; r < H; r++) rowScale[r] = G.mercRes(z) * Math.cos(G.pxToLat(y0 + r + 0.5, z) * Math.PI / 180);

  const valid = new Uint8Array(N);
  let zmin = Infinity, zmaxE = -Infinity, nValid = 0;
  for (let i = 0; i < N; i++) {
    const v = elev[i];
    if (Number.isFinite(v) && !(m.maskSea && v <= m.waterLevel)) {
      valid[i] = 1; nValid++;
      if (v < zmin) zmin = v; if (v > zmaxE) zmaxE = v;
    }
  }
  if (nValid < 100) throw new Error('Too few valid elevation cells in this area (all sea or nodata?).');

  // Stream burning (Hellweger, 1997): lower the DEM along mapped rivers so routing
  // follows them where the DEM is too flat or noisy to resolve the channel.
  const burnMask = new Uint8Array(N);
  let burnedCells = 0;
  if (m.rivers?.length) {
    progress('Burning mapped rivers into the DEM', 32);
    for (const line of m.rivers) {
      for (let k = 1; k < line.length; k++) {
        const ax = G.lonToPx(line[k - 1][1], z) - x0, ay = G.latToPx(line[k - 1][0], z) - y0;
        const bx = G.lonToPx(line[k][1], z) - x0, by = G.latToPx(line[k][0], z) - y0;
        const steps = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay))));
        for (let t = 0; t <= steps; t++) {
          const c = Math.floor(ax + (bx - ax) * t / steps), r = Math.floor(ay + (by - ay) * t / steps);
          if (c < 0 || r < 0 || c >= W || r >= H) continue;
          const i = r * W + c;
          if (valid[i] && !burnMask[i]) { burnMask[i] = 1; burnedCells++; }
        }
      }
    }
  }
  const BURN = 10;
  const routeElev = burnedCells ? elev.map((v, i) => (burnMask[i] ? v - BURN : v)) : elev;

  progress('Filling depressions (Priority-Flood)', 35);
  const filled = Hy.fillDepressions(routeElev, valid, W, H);
  progress('Routing flow (D8)', 50);
  const { down, ddist } = Hy.flowDirections(filled, valid, W, H, rowScale);
  progress('Accumulating flow', 58);
  const { acc, maxLen, headZ, order } = Hy.accumulate(down, ddist, valid, elev, W, H, rowScale);
  progress('Computing slope', 64);
  const slope = Hy.slopeGrid(elev, valid, W, H, rowScale);
  progress('Extracting stream network', 70);
  const thr = m.threshKm2 * 1e6;
  const { stream, reach, reaches } = Hy.extractReaches(down, ddist, acc, order, filled, valid, N, thr);
  if (!reaches.length) throw new Error('No streams found. Lower the stream threshold or choose a larger area.');
  progress('Computing HAND', 78);
  // HAND is measured on the un-burned surface so burn depth does not bias it.
  let handSurface = filled;
  if (burnedCells) {
    handSurface = new Float64Array(filled);
    for (let i = 0; i < N; i++) if (burnMask[i]) handSurface[i] = Math.max(elev[i], filled[i]);
  }
  const { hand, catchId } = Hy.computeHAND(down, order, handSurface, stream, reach, valid, N);
  progress('Building synthetic rating curves', 86);
  // Curves are built for n = 1; Manning's Q scales exactly with 1/n, so n is applied per scenario.
  const stages = Hy.ratingCurves(hand, catchId, slope, reaches, W, H, rowScale, 1);

  // Reach geometry for the map (cell centres, joined to the next reach)
  const cellLL = (i) => {
    const r = (i / W) | 0, c = i - r * W;
    return [+G.pxToLat(y0 + r + 0.5, z).toFixed(6), +G.pxToLon(x0 + c + 0.5, z).toFixed(6)];
  };
  let streamKm = 0;
  const reachOut = reaches.map((R, id) => {
    const pts = R.cells.map(cellLL);
    if (R.next >= 0) pts.push(cellLL(R.next));
    streamKm += R.len / 1000;
    return {
      id, line: pts, areaKm2: R.area / 1e6, lenM: R.len, slope: R.slope,
      zOut: elev[R.outlet], Q: Array.from(R.Q), As: Array.from(R.As),
    };
  });

  const bounds = {
    n: G.pxToLat(y0, z), s: G.pxToLat(y0 + H, z),
    w: G.pxToLon(x0, z), e: G.pxToLon(x0 + W, z),
  };
  S = { z, x0, y0, W, H, N, elev, filled, valid, hand, catchId, maxLen, headZ, reaches, stages, rowScale, bounds,
    depth: null, prob: null, hR: null };

  progress('Rendering layers', 95);
  const hill = renderHillshade(elev, valid, W, H, rowScale);
  const handImg = renderHAND(hand, N);
  postMessage({
    type: 'analyzed', id: m.id,
    grid: { W, H, z, cellM: G.mercRes(z) * Math.cos(latc * Math.PI / 180), bounds },
    stats: { zmin, zmax: zmaxE, nValid, burnedCells, rivers: m.rivers?.length || 0, reaches: reaches.length, streamKm, seconds: (performance.now() - t0) / 1000, source },
    stages: Array.from(stages), reaches: reachOut,
    hill, handImg,
  }, [hill.buffer, handImg.buffer]);
}

// ---------------- Flood scenarios ----------------
function scenario(m) {
  if (!S) throw new Error('Run terrain analysis first.');
  const { reaches, stages, N, W, H, hand, catchId, rowScale } = S;
  const nR = reaches.length;
  const hR = new Float32Array(nR), qR = new Float32Array(nR);
  let capped = 0, aRef = 0;
  for (const R of reaches) aRef = Math.max(aRef, R.area);
  const p = m.params;
  const n = p.n;
  for (let id = 0; id < nR; id++) {
    const R = reaches[id];
    let q;
    if (m.mode === 'stage') {
      hR[id] = p.stage;
      qR[id] = Hy.dischargeForStage(stages, R.Q, p.stage) / n;
      continue;
    } else if (m.mode === 'rain') {
      q = Hy.rationalDischarge(R, S.maxLen, S.headZ, S.elev, p.P24, p.C, p.Cf).Q;
    } else {
      q = p.Qref * Math.pow(R.area / aRef, p.b);
    }
    qR[id] = q;
    hR[id] = Hy.stageForDischarge(stages, R.Q, q * n);
    if (q * n > R.Q[R.Q.length - 1]) capped++;
  }

  const depth = new Float32Array(N).fill(NaN);
  const prob = new Float32Array(N).fill(NaN);
  const sigma = Math.max(p.sigma, 1e-3);
  let floodedM2 = 0, plausibleM2 = 0, depthSum = 0, maxDepth = 0;
  for (let r = 0; r < H; r++) {
    const a = rowScale[r] * rowScale[r];
    for (let c = 0; c < W; c++) {
      const i = r * W + c;
      const id = catchId[i];
      if (id < 0) continue;
      const h = hR[id];
      const d = h - hand[i];
      const pr = h > 0 ? Hy.normCdf(d / sigma) : 0;
      prob[i] = pr;
      if (pr >= 0.1) plausibleM2 += a;
      if (d > 0) {
        depth[i] = d; floodedM2 += a; depthSum += d * a;
        if (d > maxDepth) maxDepth = d;
      }
    }
  }
  S.depth = depth; S.prob = prob; S.hR = hR;
  const depthImg = renderDepth(depth, N);
  const probImg = renderProb(prob, N);
  postMessage({
    type: 'scenario', id: m.id,
    hR: Array.from(hR), qR: Array.from(qR),
    stats: { floodedKm2: floodedM2 / 1e6, plausibleKm2: plausibleM2 / 1e6, meanDepth: floodedM2 ? depthSum / floodedM2 : 0, maxDepth, capped },
    depthImg, probImg,
  }, [depthImg.buffer, probImg.buffer]);
}

function sample(m) {
  if (!S) throw new Error('Run terrain analysis first.');
  const { z, x0, y0, W, H } = S;
  const out = m.points.map(([lat, lon]) => {
    const c = Math.floor(G.lonToPx(lon, z) - x0), r = Math.floor(G.latToPx(lat, z) - y0);
    if (c < 0 || r < 0 || c >= W || r >= H) return null;
    const i = r * W + c;
    const depth = S.depth && Number.isFinite(S.depth[i]) ? S.depth[i] : 0;
    const prob = S.prob && Number.isFinite(S.prob[i]) ? S.prob[i] : 0;
    const reach = S.catchId[i];
    return { depth, prob, hand: Number.isFinite(S.hand[i]) ? S.hand[i] : null, elev: S.valid[i] ? S.elev[i] : null, reach,
      stage: S.hR && reach >= 0 ? S.hR[reach] : null };
  });
  postMessage({ type: 'sampled', id: m.id, values: out });
}

function exportLayer(m) {
  if (!S) throw new Error('Run terrain analysis first.');
  const layer = { dem: S.elev, hand: S.hand, depth: S.depth, prob: S.prob }[m.layer];
  if (!layer) throw new Error('Layer not available yet — run a flood scenario first.');
  const buf = G.writeGeoTIFF(layer, S.W, S.H, G.pxToMercX(S.x0, S.z), G.pxToMercY(S.y0, S.z), G.mercRes(S.z));
  postMessage({ type: 'exported', id: m.id, buffer: buf }, [buf]);
}

// ---------------- Rendering (RGBA) ----------------
function ramp(stops) {
  // stops: [[value, r, g, b, a], ...] ascending
  return (v) => {
    if (v <= stops[0][0]) return stops[0].slice(1);
    for (let k = 1; k < stops.length; k++) {
      if (v <= stops[k][0]) {
        const a = stops[k - 1], b = stops[k], t = (v - a[0]) / (b[0] - a[0]);
        return [1, 2, 3, 4].map((j) => a[j] + t * (b[j] - a[j]));
      }
    }
    return stops[stops.length - 1].slice(1);
  };
}

function paint(values, N, fn) {
  const img = new Uint8ClampedArray(N * 4);
  for (let i = 0; i < N; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    const col = fn(v);
    if (!col) continue;
    img[i * 4] = col[0]; img[i * 4 + 1] = col[1]; img[i * 4 + 2] = col[2]; img[i * 4 + 3] = col[3];
  }
  return img;
}

const handRamp = ramp([
  [0, 8, 48, 107, 235], [1, 33, 113, 181, 230], [3, 66, 146, 198, 220], [6, 107, 174, 214, 205],
  [10, 161, 217, 155, 190], [20, 254, 227, 145, 170], [40, 236, 226, 214, 140], [80, 245, 245, 240, 110],
]);
function renderHAND(hand, N) { return paint(hand, N, handRamp); }

const depthRamp = ramp([[0, 158, 202, 225, 200], [0.5, 66, 146, 198, 215], [1.5, 33, 102, 172, 225], [3, 8, 69, 148, 235], [6, 8, 29, 88, 245]]);
function renderDepth(depth, N) { return paint(depth, N, (v) => (v > 0 ? depthRamp(v) : null)); }

const probRamp = ramp([[0.05, 255, 237, 160, 90], [0.25, 254, 178, 76, 170], [0.5, 240, 59, 32, 205], [0.8, 189, 0, 38, 225], [1, 128, 0, 38, 240]]);
function renderProb(prob, N) { return paint(prob, N, (v) => (v >= 0.05 ? probRamp(v) : null)); }

function renderHillshade(elev, valid, W, H, rowScale) {
  const img = new Uint8ClampedArray(W * H * 4);
  // Burrough & McDonnell (1998) hillshade; sun from the NW at 45°.
  const azMath = ((360 - 315 + 90) * Math.PI) / 180, zen = (45 * Math.PI) / 180;
  const zf = 1.5;
  for (let r = 0; r < H; r++) {
    const s = rowScale[r];
    for (let c = 0; c < W; c++) {
      const i = r * W + c;
      if (!valid[i]) continue;
      const e = (rr, cc) => {
        rr = Math.min(H - 1, Math.max(0, rr)); cc = Math.min(W - 1, Math.max(0, cc));
        const n = rr * W + cc; return valid[n] ? elev[n] : elev[i];
      };
      const dzdx = ((e(r - 1, c + 1) + 2 * e(r, c + 1) + e(r + 1, c + 1)) - (e(r - 1, c - 1) + 2 * e(r, c - 1) + e(r + 1, c - 1))) / (8 * s);
      const dzdy = ((e(r + 1, c - 1) + 2 * e(r + 1, c) + e(r + 1, c + 1)) - (e(r - 1, c - 1) + 2 * e(r - 1, c) + e(r - 1, c + 1))) / (8 * s);
      const slope = Math.atan(zf * Math.hypot(dzdx, dzdy));
      const aspect = Math.atan2(dzdy, -dzdx);
      let hs = Math.cos(zen) * Math.cos(slope) + Math.sin(zen) * Math.sin(slope) * Math.cos(azMath - aspect);
      hs = Math.max(0, hs);
      const v = 40 + 215 * hs;
      img[i * 4] = v; img[i * 4 + 1] = v; img[i * 4 + 2] = v; img[i * 4 + 3] = 255;
    }
  }
  return img;
}
