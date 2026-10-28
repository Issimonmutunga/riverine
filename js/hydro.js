// Flood Depths hydrology core — pure functions over a regular grid.
//
// Pipeline (all O(n) or O(n log n)):
//   1. Priority-Flood + epsilon depression filling      (Barnes et al., 2014)
//   2. D8 steepest-descent flow directions              (O'Callaghan & Mark, 1984)
//   3. Topological flow accumulation + longest flow path
//   4. Stream extraction by contributing-area threshold
//   5. Reach segmentation (confluence/length breaks)
//   6. HAND: height above the drainage cell each cell flows to
//                                                        (Rennó et al., 2008; Nobre et al., 2011)
//   7. Synthetic rating curves from HAND per reach catchment
//                                                        (Zheng, Tarboton et al., 2018)
//
// Grid convention: row-major, index = r * W + c. Cell ground size varies by row
// (Web Mercator), given by `rowScale[r]` in metres.

const DR = [-1, -1, 0, 1, 1, 1, 0, -1];
const DC = [0, 1, 1, 1, 0, -1, -1, -1];
const DIAG = [false, true, false, true, false, true, false, true];

// ---------- Min-heap keyed by Float64 ----------
class MinHeap {
  constructor(capacity) {
    this.keys = new Float64Array(capacity);
    this.vals = new Int32Array(capacity);
    this.size = 0;
  }
  push(key, val) {
    let i = this.size++;
    const k = this.keys, v = this.vals;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.keys, v = this.vals;
    const top = v[0];
    const n = --this.size;
    if (n > 0) {
      const key = k[n], val = v[n];
      let i = 0;
      for (;;) {
        let l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        if (r < n && k[r] < k[l]) l = r;
        if (k[l] >= key) break;
        k[i] = k[l]; v[i] = v[l]; i = l;
      }
      k[i] = key; v[i] = val;
    }
    return top;
  }
}

// ---------- 1. Priority-Flood + epsilon ----------
// Every cell ends strictly higher than the cell it was reached from, so the
// filled surface has no pits and no flats: D8 always finds a downslope path.
export function fillDepressions(elev, valid, W, H, eps = 1e-5) {
  const N = W * H;
  const filled = new Float64Array(N);
  for (let i = 0; i < N; i++) filled[i] = elev[i];
  const closed = new Uint8Array(N);
  const heap = new MinHeap(N);

  // Seeds: valid cells on the grid edge or next to nodata (sea / voids) are outlets.
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const i = r * W + c;
      if (!valid[i]) { closed[i] = 1; continue; }
      let edge = r === 0 || c === 0 || r === H - 1 || c === W - 1;
      if (!edge) {
        for (let d = 0; d < 8; d++) {
          if (!valid[(r + DR[d]) * W + c + DC[d]]) { edge = true; break; }
        }
      }
      if (edge) { closed[i] = 1; heap.push(filled[i], i); }
    }
  }

  while (heap.size > 0) {
    const i = heap.pop();
    const r = (i / W) | 0, c = i - r * W;
    const zi = filled[i];
    for (let d = 0; d < 8; d++) {
      const rr = r + DR[d], cc = c + DC[d];
      if (rr < 0 || cc < 0 || rr >= H || cc >= W) continue;
      const n = rr * W + cc;
      if (closed[n]) continue;
      closed[n] = 1;
      if (filled[n] <= zi + eps) filled[n] = zi + eps;
      heap.push(filled[n], n);
    }
  }
  return filled;
}

// ---------- 2. D8 flow directions ----------
// down[i] = index of the receiving cell, or -1 for outlets.
export function flowDirections(filled, valid, W, H, rowScale) {
  const N = W * H;
  const down = new Int32Array(N).fill(-1);
  const ddist = new Float32Array(N); // distance (m) to the downstream cell
  for (let r = 0; r < H; r++) {
    const s = rowScale[r], sd = s * Math.SQRT2;
    for (let c = 0; c < W; c++) {
      const i = r * W + c;
      if (!valid[i]) continue;
      const zi = filled[i];
      // Edge cells may drain inward or off-map, never along the edge (avoids
      // artificial boundary-parallel streams).
      const edge = r === 0 || c === 0 || r === H - 1 || c === W - 1;
      let best = 0, bestN = -1, bestD = 0;
      for (let d = 0; d < 8; d++) {
        const rr = r + DR[d], cc = c + DC[d];
        if (rr < 0 || cc < 0 || rr >= H || cc >= W) continue;
        if (edge && (rr === 0 || cc === 0 || rr === H - 1 || cc === W - 1)) continue;
        const n = rr * W + cc;
        if (!valid[n]) continue;
        const dist = DIAG[d] ? sd : s;
        const g = (zi - filled[n]) / dist;
        if (g > best) { best = g; bestN = n; bestD = dist; }
      }
      down[i] = bestN;
      ddist[i] = bestD;
    }
  }
  return { down, ddist };
}

// ---------- 3. Flow accumulation (topological, upstream → downstream) ----------
export function accumulate(down, ddist, valid, elev, W, H, rowScale) {
  const N = W * H;
  const indeg = new Int32Array(N);
  for (let i = 0; i < N; i++) if (down[i] >= 0) indeg[down[i]]++;

  const acc = new Float64Array(N);       // contributing area (m²)
  const maxLen = new Float32Array(N);    // longest upstream flow path (m)
  const headZ = new Float32Array(N);     // elevation at the start of that path
  const order = new Int32Array(N);
  let head = 0, tail = 0;

  for (let r = 0; r < H; r++) {
    const a = rowScale[r] * rowScale[r];
    for (let c = 0; c < W; c++) {
      const i = r * W + c;
      if (!valid[i]) continue;
      acc[i] = a;
      headZ[i] = elev[i];
      if (indeg[i] === 0) order[tail++] = i;
    }
  }
  while (head < tail) {
    const i = order[head++];
    const d = down[i];
    if (d < 0) continue;
    acc[d] += acc[i];
    const L = maxLen[i] + ddist[i];
    if (L > maxLen[d]) { maxLen[d] = L; headZ[d] = headZ[i]; }
    if (--indeg[d] === 0) order[tail++] = d;
  }
  return { acc, maxLen, headZ, order: order.subarray(0, tail) };
}

// ---------- Local slope (Horn, 1981) for bed-area correction ----------
export function slopeGrid(elev, valid, W, H, rowScale) {
  const N = W * H;
  const slope = new Float32Array(N);
  const z = (r, c, i) => {
    r = Math.min(H - 1, Math.max(0, r)); c = Math.min(W - 1, Math.max(0, c));
    const n = r * W + c;
    return valid[n] ? elev[n] : elev[i];
  };
  for (let r = 0; r < H; r++) {
    const s = rowScale[r];
    for (let c = 0; c < W; c++) {
      const i = r * W + c;
      if (!valid[i]) continue;
      const a = z(r - 1, c - 1, i), b = z(r - 1, c, i), cc = z(r - 1, c + 1, i);
      const d = z(r, c - 1, i), f = z(r, c + 1, i);
      const g = z(r + 1, c - 1, i), h = z(r + 1, c, i), k = z(r + 1, c + 1, i);
      const dzdx = ((cc + 2 * f + k) - (a + 2 * d + g)) / (8 * s);
      const dzdy = ((g + 2 * h + k) - (a + 2 * b + cc)) / (8 * s);
      slope[i] = Math.sqrt(dzdx * dzdx + dzdy * dzdy);
    }
  }
  return slope;
}

// ---------- 4–5. Streams and reaches ----------
export function extractReaches(down, ddist, acc, order, filled, valid, N, thresholdM2, maxReachLen = 3000) {
  const stream = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (valid[i] && acc[i] >= thresholdM2) stream[i] = 1;

  const upCount = new Uint8Array(N);
  const upCell = new Int32Array(N).fill(-1);
  for (let i = 0; i < N; i++) {
    if (!stream[i]) continue;
    const d = down[i];
    if (d >= 0 && stream[d]) { upCount[d]++; upCell[d] = i; }
  }

  const reach = new Int32Array(N).fill(-1);
  const reaches = []; // { cells: [], len, top, bottom }
  for (let k = 0; k < order.length; k++) {
    const i = order[k];
    if (!stream[i]) continue;
    let id = -1;
    if (upCount[i] === 1) {
      const up = reach[upCell[i]];
      if (reaches[up].len < maxReachLen) id = up;
    }
    if (id < 0) {
      id = reaches.length;
      reaches.push({ cells: [], len: 0 });
    }
    reach[i] = id;
    const R = reaches[id];
    R.cells.push(i);
    R.len += ddist[i];
  }

  for (const R of reaches) {
    const top = R.cells[0], bot = R.cells[R.cells.length - 1];
    R.outlet = bot;
    R.len = Math.max(R.len, 1);
    R.slope = Math.max((filled[top] - filled[bot]) / R.len, 1e-4);
    R.area = acc[bot];
    // downstream reach (for drawing connected lines)
    const d = down[bot];
    R.next = d >= 0 && stream[d] ? d : -1;
  }
  return { stream, reach, reaches };
}

// ---------- 6. HAND (downstream → upstream) ----------
export function computeHAND(down, order, filled, stream, reach, valid, N) {
  const drainZ = new Float64Array(N).fill(NaN);
  const catchId = new Int32Array(N).fill(-1);
  for (let k = order.length - 1; k >= 0; k--) {
    const i = order[k];
    if (stream[i]) { drainZ[i] = filled[i]; catchId[i] = reach[i]; }
    else {
      const d = down[i];
      if (d >= 0) { drainZ[i] = drainZ[d]; catchId[i] = catchId[d]; }
    }
  }
  const hand = new Float32Array(N).fill(NaN);
  for (let i = 0; i < N; i++) {
    if (valid[i] && catchId[i] >= 0) hand[i] = Math.max(0, filled[i] - drainZ[i]);
  }
  return { hand, catchId };
}

// ---------- 7. Synthetic rating curves (Zheng et al., 2018) ----------
// For stage h in a reach catchment:
//   surface area As = Σ A_i [HAND_i < h]
//   volume       V  = Σ (h − HAND_i) A_i
//   bed area     Ab = Σ A_i √(1 + slope_i²)
//   A = V/L,  P = Ab/L,  R = A/P,  Q = (1/n) A R^(2/3) S^(1/2)        (Manning)
export function ratingCurves(hand, catchId, slope, reaches, W, H, rowScale, n, dh = 0.25, hmax = 20) {
  const K = Math.round(hmax / dh);
  const nR = reaches.length;
  const bA = new Float64Array(nR * (K + 1));
  const bHA = new Float64Array(nR * (K + 1));
  const bB = new Float64Array(nR * (K + 1));
  for (let r = 0; r < H; r++) {
    const a = rowScale[r] * rowScale[r];
    for (let c = 0; c < W; c++) {
      const i = r * W + c;
      const id = catchId[i];
      if (id < 0) continue;
      const h = hand[i];
      if (!(h < hmax)) continue;
      const j = Math.min(K, Math.floor(h / dh) + 1);
      const o = id * (K + 1) + j;
      bA[o] += a;
      bHA[o] += h * a;
      bB[o] += a * Math.sqrt(1 + slope[i] * slope[i]);
    }
  }
  const stages = new Float32Array(K + 1);
  for (let k = 0; k <= K; k++) stages[k] = k * dh;
  for (let id = 0; id < nR; id++) {
    const R = reaches[id];
    const Q = new Float32Array(K + 1);
    const As = new Float32Array(K + 1);
    let cA = 0, cHA = 0, cB = 0;
    const sqS = Math.sqrt(R.slope);
    for (let k = 1; k <= K; k++) {
      const o = id * (K + 1) + k;
      cA += bA[o]; cHA += bHA[o]; cB += bB[o];
      const h = k * dh;
      const V = h * cA - cHA;
      const Ax = V / R.len, P = cB / R.len;
      const Rh = P > 0 ? Ax / P : 0;
      Q[k] = (Ax * Math.pow(Rh, 2 / 3) * sqS) / n;
      As[k] = cA;
      // enforce monotonicity (numerical safety)
      if (Q[k] < Q[k - 1]) Q[k] = Q[k - 1];
    }
    R.Q = Q;
    R.As = As;
  }
  return stages;
}

export function stageForDischarge(stages, Q, q) {
  if (!(q > 0)) return 0;
  const K = stages.length - 1;
  if (q >= Q[K]) return stages[K];
  for (let k = 1; k <= K; k++) {
    if (Q[k] >= q) {
      const t = (q - Q[k - 1]) / Math.max(Q[k] - Q[k - 1], 1e-12);
      return stages[k - 1] + t * (stages[k] - stages[k - 1]);
    }
  }
  return stages[K];
}

export function dischargeForStage(stages, Q, h) {
  const K = stages.length - 1;
  const dh = stages[1] - stages[0];
  const x = Math.min(K, Math.max(0, h / dh));
  const k = Math.floor(x);
  if (k >= K) return Q[K];
  return Q[k] + (x - k) * (Q[k + 1] - Q[k]);
}

// ---------- Design discharge for ungauged catchments ----------
// Rational method  Q = Cf · C · i · A / 3.6   (Q m³/s, i mm/h, A km²)
// Time of concentration: Kirpich (1940), tc[min] = 0.0195 L^0.77 S^−0.385
// Intensity from a 24-h design depth: IMD short-duration ratio i_t = (P24/24)(24/t)^(1/3)
// Areal reduction: Leclerc & Schaake (1972) fit to US Weather Bureau TP-29.
export function rationalDischarge(R, maxLen, headZ, elev, P24, C, Cf) {
  const o = R.outlet;
  const L = Math.max(maxLen[o], 50);
  const S = Math.max((headZ[o] - elev[o]) / L, 1e-3);
  const tcMin = Math.max(5, 0.0195 * Math.pow(L, 0.77) * Math.pow(S, -0.385));
  const tcH = tcMin / 60;
  const tEff = Math.min(tcH, 24);
  const i24 = P24 / 24;
  const i = i24 * Math.pow(24 / tEff, 1 / 3);
  const Akm2 = R.area / 1e6;
  const Ami2 = Akm2 / 2.59;
  const x = 1.1 * Math.pow(tEff, 0.25);
  const arf = Math.min(1, 1 - Math.exp(-x) + Math.exp(-x - 0.01 * Ami2));
  return { Q: (Cf * C * i * arf * Akm2) / 3.6, tcMin, i, arf };
}

// Standard normal CDF (Abramowitz & Stegun 7.1.26 via erf)
export function normCdf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}
