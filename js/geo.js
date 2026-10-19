// Geodesy helpers: Web Mercator tile math, UTM (WGS84), and a minimal GeoTIFF writer.

export const R_EARTH = 6378137;
export const TILE = 256;

// Global pixel coordinates at zoom z (256-px tiles).
export function lonToPx(lon, z) { return ((lon + 180) / 360) * TILE * 2 ** z; }
export function latToPx(lat, z) {
  const s = Math.sin((lat * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE * 2 ** z;
}
export function pxToLon(x, z) { return (x / (TILE * 2 ** z)) * 360 - 180; }
export function pxToLat(y, z) {
  const n = Math.PI - (2 * Math.PI * y) / (TILE * 2 ** z);
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}
// Mercator metres per pixel at zoom z (at the equator).
export function mercRes(z) { return (2 * Math.PI * R_EARTH) / (TILE * 2 ** z); }
export function pxToMercX(x, z) { return x * mercRes(z) - Math.PI * R_EARTH; }
export function pxToMercY(y, z) { return Math.PI * R_EARTH - y * mercRes(z); }
export function mercToLon(x) { return (x / R_EARTH) * (180 / Math.PI); }
export function mercToLat(y) { return (180 / Math.PI) * (2 * Math.atan(Math.exp(y / R_EARTH)) - Math.PI / 2); }

// ---------- UTM on WGS84 (Snyder, 1987) ----------
const A = 6378137, F = 1 / 298.257223563, K0 = 0.9996;
const E2 = F * (2 - F), EP2 = E2 / (1 - E2);

export function utmForward(lat, lon, zone, south) {
  const phi = (lat * Math.PI) / 180;
  const lam0 = (((zone - 1) * 6 - 180 + 3) * Math.PI) / 180;
  const lam = (lon * Math.PI) / 180;
  const sin = Math.sin(phi), cos = Math.cos(phi), tan = Math.tan(phi);
  const N = A / Math.sqrt(1 - E2 * sin * sin);
  const T = tan * tan, C = EP2 * cos * cos, Aa = cos * (lam - lam0);
  const e4 = E2 * E2, e6 = e4 * E2;
  const M = A * ((1 - E2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * phi
    - ((3 * E2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * phi)
    + ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * phi)
    - ((35 * e6) / 3072) * Math.sin(6 * phi));
  const x = K0 * N * (Aa + ((1 - T + C) * Aa ** 3) / 6 + ((5 - 18 * T + T * T + 72 * C - 58 * EP2) * Aa ** 5) / 120) + 500000;
  let y = K0 * (M + N * tan * ((Aa * Aa) / 2 + ((5 - T + 9 * C + 4 * C * C) * Aa ** 4) / 24
    + ((61 - 58 * T + T * T + 600 * C - 330 * EP2) * Aa ** 6) / 720));
  if (south) y += 10000000;
  return [x, y];
}

export function utmInverse(E, Nn, zone, south) {
  const x = E - 500000;
  const y = south ? Nn - 10000000 : Nn;
  const e4 = E2 * E2, e6 = e4 * E2;
  const M = y / K0;
  const mu = M / (A * (1 - E2 / 4 - (3 * e4) / 64 - (5 * e6) / 256));
  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
  const phi1 = mu + ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu)
    + ((21 * e1 * e1) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu)
    + ((151 * e1 ** 3) / 96) * Math.sin(6 * mu)
    + ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const s = Math.sin(phi1), c = Math.cos(phi1), t = Math.tan(phi1);
  const N1 = A / Math.sqrt(1 - E2 * s * s);
  const T1 = t * t, C1 = EP2 * c * c;
  const R1 = (A * (1 - E2)) / Math.pow(1 - E2 * s * s, 1.5);
  const D = x / (N1 * K0);
  const lat = phi1 - ((N1 * t) / R1) * ((D * D) / 2
    - ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * EP2) * D ** 4) / 24
    + ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * EP2 - 3 * C1 * C1) * D ** 6) / 720);
  const lam0 = (((zone - 1) * 6 - 180 + 3) * Math.PI) / 180;
  const lon = lam0 + (D - ((1 + 2 * T1 + C1) * D ** 3) / 6
    + ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * EP2 + 24 * T1 * T1) * D ** 5) / 120) / c;
  return [(lat * 180) / Math.PI, (lon * 180) / Math.PI];
}

// Build forward/inverse transforms (lat/lon <-> source CRS) for an EPSG code.
export function crsTransforms(epsg) {
  if (epsg === 4326 || epsg === 4269 || epsg === 4258) {
    return { fwd: (lat, lon) => [lon, lat], inv: (x, y) => [y, x], name: `EPSG:${epsg} (geographic)` };
  }
  if (epsg === 3857 || epsg === 900913 || epsg === 102100) {
    return {
      fwd: (lat, lon) => [(lon * Math.PI / 180) * R_EARTH, R_EARTH * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))],
      inv: (x, y) => [mercToLat(y), mercToLon(x)],
      name: 'EPSG:3857 (Web Mercator)',
    };
  }
  if ((epsg > 32600 && epsg <= 32660) || (epsg > 32700 && epsg <= 32760)) {
    const south = epsg > 32700;
    const zone = epsg - (south ? 32700 : 32600);
    return {
      fwd: (lat, lon) => utmForward(lat, lon, zone, south),
      inv: (x, y) => utmInverse(x, y, zone, south),
      name: `EPSG:${epsg} (UTM ${zone}${south ? 'S' : 'N'})`,
    };
  }
  return null;
}

// ---------- Minimal GeoTIFF writer: single-band Float32, EPSG:3857, PixelIsArea ----------
export function writeGeoTIFF(data, W, H, originX, originY, pixelSize, nodata = -9999) {
  const entries = [];
  const extra = []; // [offsetPlaceholderIndex, bytes]
  const SHORT = 3, LONG = 4, DOUBLE = 12, ASCII = 2;
  const geoKeys = [1, 1, 0, 3, 1024, 0, 1, 1, 1025, 0, 1, 1, 3072, 0, 1, 3857];
  const nodataStr = `${nodata}\0`;
  const add = (tag, type, values) => entries.push({ tag, type, values });
  add(256, LONG, [W]);
  add(257, LONG, [H]);
  add(258, SHORT, [32]);
  add(259, SHORT, [1]);
  add(262, SHORT, [1]);
  add(273, LONG, [0]);           // strip offset patched later
  add(277, SHORT, [1]);
  add(278, LONG, [H]);
  add(279, LONG, [W * H * 4]);
  add(284, SHORT, [1]);
  add(339, SHORT, [3]);
  add(33550, DOUBLE, [pixelSize, pixelSize, 0]);
  add(33922, DOUBLE, [0, 0, 0, originX, originY, 0]);
  add(34735, SHORT, geoKeys);
  add(42113, ASCII, [...nodataStr].map((ch) => ch.charCodeAt(0)));

  const size = { [SHORT]: 2, [LONG]: 4, [DOUBLE]: 8, [ASCII]: 1 };
  const ifdOffset = 8;
  const ifdSize = 2 + entries.length * 12 + 4;
  let cursor = ifdOffset + ifdSize;
  for (const e of entries) {
    const bytes = size[e.type] * e.values.length;
    if (bytes > 4) { e.offset = cursor; cursor += bytes + (bytes & 1); }
  }
  const dataOffset = (cursor + 3) & ~3; // Float32Array view needs 4-byte alignment
  entries.find((e) => e.tag === 273).values[0] = dataOffset;
  const total = dataOffset + W * H * 4;
  const buf = new ArrayBuffer(total);
  const dv = new DataView(buf);
  dv.setUint8(0, 0x49); dv.setUint8(1, 0x49);
  dv.setUint16(2, 42, true);
  dv.setUint32(4, ifdOffset, true);
  dv.setUint16(ifdOffset, entries.length, true);
  const writeVals = (off, type, vals) => {
    vals.forEach((v, k) => {
      if (type === SHORT) dv.setUint16(off + k * 2, v, true);
      else if (type === LONG) dv.setUint32(off + k * 4, v, true);
      else if (type === DOUBLE) dv.setFloat64(off + k * 8, v, true);
      else dv.setUint8(off + k, v);
    });
  };
  entries.forEach((e, k) => {
    const p = ifdOffset + 2 + k * 12;
    dv.setUint16(p, e.tag, true);
    dv.setUint16(p + 2, e.type, true);
    dv.setUint32(p + 4, e.values.length, true);
    if (e.offset !== undefined) { dv.setUint32(p + 8, e.offset, true); writeVals(e.offset, e.type, e.values); }
    else writeVals(p + 8, e.type, e.values);
  });
  dv.setUint32(ifdOffset + 2 + entries.length * 12, 0, true);
  const out = new Float32Array(buf, dataOffset, W * H);
  for (let i = 0; i < W * H; i++) out[i] = Number.isFinite(data[i]) ? data[i] : nodata;
  return buf;
}
