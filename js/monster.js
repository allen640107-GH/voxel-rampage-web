// 巨獸 v1.1：以「形狀點陣化」產生的精細體素模型
// 每個部位由橢球／錐形膠囊／圓錐／方塊疊合，再依畫質 LOD 切成細小體素並合併成一個網格（每部位最多 2 個 draw call）。
import * as THREE from "../vendor/three.module.js";
import { meshVoxels, toGeometry, defineMat, hash3 } from "./world.js";

// ---- 調色盤（多層配色：底色、亮色、暗色、花紋、腹部…）----
// 暴龍 40–53
defineMat(40, 0x5f9e3a); defineMat(41, 0x68a640); defineMat(42, 0x3a6626); defineMat(43, 0x6b4a2a); defineMat(44, 0xdcd89c); defineMat(45, 0xc2c07e);
defineMat(46, 0xf6f2e2); defineMat(47, 0x5a1420); defineMat(48, 0xd2506a); defineMat(49, 0xffd21e, { g: 1 }); defineMat(50, 0x1a1208); defineMat(51, 0xeee8d4);
defineMat(52, 0x9a9380); defineMat(53, 0x1e2a14);
// 巨猿 54–62
defineMat(54, 0x3a3a42); defineMat(55, 0x4c4c57); defineMat(56, 0x222227); defineMat(57, 0x9a9aa4); defineMat(58, 0x857870); defineMat(59, 0x51473f);
defineMat(60, 0xff9a1a, { g: 1 }); defineMat(61, 0x5f5852); defineMat(62, 0x6f665e);
// 晶甲獸 63–71
defineMat(63, 0x6c7078); defineMat(64, 0x7e838c); defineMat(65, 0x464a53); defineMat(66, 0x2fb8ff, { g: 1 }); defineMat(67, 0xa8ecff, { g: 1 }); defineMat(68, 0x7af0ff, { g: 1 });
defineMat(69, 0xa39d90); defineMat(70, 0xe2dccb); defineMat(71, 0x1f6fe0, { g: 1 });

// LOD：體素邊長（公尺）。0 低畫質、1 中、2 高
export const MON_LOD = [0.3, 0.24, 0.19];

// ---- 形狀 ----
const ell = (c, r, m) => ({ t: 0, c, r, m });
const cap = (a, b, r0, r1, m) => ({ t: 1, a, b, r0, r1, m }); // 錐形膠囊（兩端半徑不同）
const cone = (a, b, r, m) => ({ t: 1, a, b, r0: r, r1: 0.02, m });
const box = (lo, hi, m) => ({ t: 2, lo, hi, m });
const carve = (s) => ((s.carve = true), s);
const mx = (s) => { // 左右鏡像
  const f = (p) => [-p[0], p[1], p[2]];
  if (s.t === 0) return { ...s, c: f(s.c) };
  if (s.t === 1) return { ...s, a: f(s.a), b: f(s.b) };
  return { ...s, lo: [-s.hi[0], s.lo[1], s.lo[2]], hi: [-s.lo[0], s.hi[1], s.hi[2]] };
};
const sym = (arr) => [...arr, ...arr.map(mx)];
function bounds(s) {
  if (s.t === 0) return [s.c[0] - s.r[0], s.c[1] - s.r[1], s.c[2] - s.r[2], s.c[0] + s.r[0], s.c[1] + s.r[1], s.c[2] + s.r[2]];
  if (s.t === 1) { const R = Math.max(s.r0, s.r1); return [Math.min(s.a[0], s.b[0]) - R, Math.min(s.a[1], s.b[1]) - R, Math.min(s.a[2], s.b[2]) - R, Math.max(s.a[0], s.b[0]) + R, Math.max(s.a[1], s.b[1]) + R, Math.max(s.a[2], s.b[2]) + R]; }
  return [...s.lo, ...s.hi];
}
// 點在形狀內 → 回傳 rel（-1 底 … 1 頂），否則 null
function inside(s, x, y, z) {
  if (s.t === 0) {
    const dx = (x - s.c[0]) / s.r[0], dy = (y - s.c[1]) / s.r[1], dz = (z - s.c[2]) / s.r[2];
    return dx * dx + dy * dy + dz * dz <= 1 ? dy : null;
  }
  if (s.t === 1) {
    const ax = s.b[0] - s.a[0], ay = s.b[1] - s.a[1], az = s.b[2] - s.a[2], L2 = ax * ax + ay * ay + az * az || 1e-6;
    const u = Math.max(0, Math.min(1, ((x - s.a[0]) * ax + (y - s.a[1]) * ay + (z - s.a[2]) * az) / L2));
    const px = s.a[0] + ax * u, py = s.a[1] + ay * u, pz = s.a[2] + az * u, r = s.r0 + (s.r1 - s.r0) * u;
    const dx = x - px, dy = y - py, dz = z - pz;
    return dx * dx + dy * dy + dz * dz <= r * r ? dy / r : null;
  }
  return x >= s.lo[0] && x <= s.hi[0] && y >= s.lo[1] && y <= s.hi[1] && z >= s.lo[2] && z <= s.hi[2] ? (2 * (y - s.lo[1])) / (s.hi[1] - s.lo[1] || 1) - 1 : null;
}

// ---- 表面花紋（每個體素依位置上色）----
const cell = (v, n) => Math.floor(v / n);
const H = (x, y, z) => hash3(Math.floor(x * 7.1) + 911, Math.floor(y * 7.1) + 37, Math.floor(z * 7.1) + 5);
// 暴龍皮：深色背脊、棕色虎斑、鱗片棋盤、淺色腹部
const rexSkin = (x, y, z, rel) => {
  if (rel < -0.42) return (cell(x, 0.45) + cell(z, 0.45)) & 1 ? 44 : 45;
  if (rel < -0.25) return 45;
  if (rel > 0.2 && Math.sin(z * 1.7 + Math.abs(x) * 0.6) > 0.62) return 43;
  if (rel > 0.62) return 42;
  const k = (cell(x, 0.42) + cell(y, 0.42) + cell(z, 0.42)) & 1;
  return H(x, y, z) > 0.94 ? 42 : k ? 40 : 41;
};
const rexHead = (x, y, z, rel) => (rel > 0.55 ? (H(x, y, z) > 0.6 ? 42 : 40) : rexSkin(x, y, z, Math.min(rel, 0.15)));
const rexDark = (x, y, z) => (H(x, y, z) > 0.7 ? 43 : 42);
// 巨猿毛：一束束毛流、背部銀毛、腹側較暗
const fur = (x, y, z, rel) => {
  if (rel < -0.6) return 56;
  const strand = hash3(Math.floor(x * 5) + 3, Math.floor(y * 1.6), Math.floor(z * 5) + 9);
  return strand > 0.72 ? 55 : strand < 0.12 ? 56 : 54;
};
const apeBack = (x, y, z, rel) => (z < -0.5 && y > 8.2 && y < 12.6 ? (hash3(Math.floor(x * 5), Math.floor(y * 2), 7) > 0.35 ? 57 : 55) : fur(x, y, z, rel));
// 晶甲獸：骨板網格、石紋、淺色腹甲
const plates = (x, y, z, rel) => {
  if (rel < -0.45) return 69;
  if (rel > 0.05) {
    const fx = x / 1.25 - Math.floor(x / 1.25), fz = (z + (cell(x, 1.25) & 1) * 0.6) / 1.25 - Math.floor((z + (cell(x, 1.25) & 1) * 0.6) / 1.25);
    if (fx < 0.16 || fz < 0.16) return 65;
    return hash3(cell(x, 1.25), 3, cell(z + (cell(x, 1.25) & 1) * 0.6, 1.25)) > 0.5 ? 64 : 63;
  }
  return H(x, y, z) > 0.8 ? 65 : 63;
};
const stone = (x, y, z, rel) => (rel < -0.5 ? 69 : H(x, y, z) > 0.78 ? 64 : 63);
const crystal = (x, y, z, rel, u) => (u > 0.62 ? 67 : u < 0.18 ? 71 : 66);

// ---- 暴龍 ----
function trexRig() {
  const P = {};
  const scutes = []; // 背脊鱗板
  for (let z = 3.6; z >= -15; z -= 0.75) {
    const top = z > -4.4 ? 7.6 + 2.9 * Math.sqrt(Math.max(0, 1 - (z / 4.4) ** 2)) : 0;
    if (z > -4.4) scutes.push({ z, y: top - 0.15, h: 0.75 + 0.25 * Math.cos(z), seg: "body" });
  }
  P.body = { pivot: [0, 7.4, -0.5], shapes: [
    ell([0, 7.6, 0], [2.7, 2.9, 4.3], rexSkin), ell([0, 8.7, 2.6], [2.3, 2.6, 2.6], rexSkin), ell([0, 7.4, -2.7], [2.6, 2.6, 2.9], rexSkin),
    cap([0, 9.4, 3.0], [0, 10.6, 5.0], 1.8, 1.35, rexSkin),
    ...scutes.map((s, i) => cone([0, s.y, s.z], [0, s.y + s.h, s.z - 0.35], 0.42, i & 1 ? 43 : 42)),
  ] };
  P.head = { parent: "body", pivot: [0, 10.8, 5.3], shapes: [
    ell([0, 11.5, 6.6], [1.75, 1.5, 2.0], rexHead),
    ell([0, 10.95, 8.5], [1.35, 1.0, 2.1], rexHead),
    carve(box([-2, 8.5, 7.3], [2, 10.2, 11]) ),
    ell([0, 10.35, 7.6], [1.05, 0.25, 1.6], 47), // 口腔
    ...sym([ell([0.95, 12.5, 7.0], [0.5, 0.3, 0.85], rexDark), ell([0.42, 11.75, 10.15], [0.2, 0.18, 0.22], 53)]),
    ...sym([7.55, 8.1, 8.65, 9.2, 9.75].map((z, i) => cone([1.15 - i * 0.1, 10.35, z], [1.12 - i * 0.1, 9.45 + i * 0.05, z + 0.08], 0.2, 46))),
    cone([0.3, 10.35, 10.25], [0.3, 9.6, 10.3], 0.18, 46), cone([-0.3, 10.35, 10.25], [-0.3, 9.6, 10.3], 0.18, 46),
  ] };
  P.eyes = { parent: "head", pivot: [0, 11.95, 7.05], shapes: sym([ell([1.42, 11.95, 7.05], [0.36, 0.42, 0.46], 49), ell([1.72, 11.95, 7.15], [0.16, 0.34, 0.18], 50)]) };
  P.jaw = { parent: "head", pivot: [0, 10.1, 6.1], shapes: [
    ell([0, 9.75, 8.0], [1.0, 0.55, 2.05], (x, y, z, rel) => (rel > 0.35 ? 47 : rel < -0.3 ? 45 : 40)),
    ell([0, 10.1, 7.7], [0.55, 0.2, 1.3], 48), // 舌頭
    ...sym([7.3, 7.85, 8.4, 8.95].map((z, i) => cone([0.82 - i * 0.07, 10.05, z], [0.82 - i * 0.07, 10.75, z + 0.06], 0.17, 46))),
  ] };
  for (const sd of [1, -1]) {
    const S = sd > 0 ? "L" : "R", X = (v) => v * sd;
    P["arm" + S] = { parent: "body", pivot: [X(1.6), 8.2, 3.4], shapes: [
      cap([X(1.6), 8.2, 3.4], [X(1.95), 7.1, 4.4], 0.5, 0.38, rexSkin), cap([X(1.95), 7.1, 4.4], [X(1.85), 6.7, 5.3], 0.38, 0.3, rexSkin),
      cone([X(1.7), 6.7, 5.35], [X(1.65), 6.15, 5.75], 0.14, 51), cone([X(2.0), 6.7, 5.35], [X(2.05), 6.15, 5.75], 0.14, 51),
    ] };
    P["thigh" + S] = { pivot: [X(2.0), 7.0, -1.6], shapes: [
      cap([X(2.0), 7.2, -1.8], [X(2.25), 4.4, -0.8], 1.45, 0.95, rexSkin), ell([X(2.15), 5.9, -1.4], [1.15, 1.9, 1.7], rexSkin),
    ] };
    P["shin" + S] = { parent: "thigh" + S, pivot: [X(2.25), 4.3, -0.8], shapes: [
      cap([X(2.25), 4.3, -0.8], [X(2.25), 1.45, -1.9], 0.85, 0.55, rexSkin), cap([X(2.25), 1.45, -1.9], [X(2.25), 0.5, -1.35], 0.55, 0.45, rexSkin),
    ] };
    P["foot" + S] = { parent: "shin" + S, pivot: [X(2.25), 0.5, -1.35], shapes: [
      ell([X(2.25), 0.4, -1.1], [0.85, 0.42, 1.1], rexSkin),
      ...[-0.6, 0, 0.6].map((o) => cap([X(2.25 + o * 0.7), 0.35, -0.6], [X(2.25 + o), 0.3, 0.55 - Math.abs(o) * 0.3], 0.32, 0.25, rexSkin)),
      ...[-0.6, 0, 0.6].map((o) => cone([X(2.25 + o), 0.32, 0.6 - Math.abs(o) * 0.3], [X(2.25 + o * 1.05), 0.03, 1.15 - Math.abs(o) * 0.3], 0.2, 51)),
      cone([X(2.25), 0.5, -1.9], [X(2.25), 0.15, -2.4], 0.16, 52), // 後趾
    ] };
  }
  const T = [[0, 7.7, -4.6], [0, 7.4, -8.0], [0, 7.0, -11.2], [0, 6.6, -13.8], [0, 6.4, -15.9]], TR = [2.0, 1.55, 1.05, 0.62, 0.18];
  for (let i = 0; i < 4; i++) {
    const a = T[i], b = T[i + 1], sh = [cap(a, b, TR[i] + 0.05, TR[i + 1] + 0.12, rexSkin)];
    for (let u = 0.15; u < 1; u += 0.33) {
      const z = a[2] + (b[2] - a[2]) * u, y = a[1] + (b[1] - a[1]) * u + TR[i] + (TR[i + 1] - TR[i]) * u - 0.12, h = 0.25 + 0.5 * (TR[i] + (TR[i + 1] - TR[i]) * u) / 2;
      sh.push(cone([0, y, z], [0, y + h, z - 0.3], 0.18 + h * 0.4, (i + Math.round(u * 3)) & 1 ? 43 : 42));
    }
    P["tail" + (i + 1)] = { parent: i ? "tail" + i : "body", pivot: a, shapes: sh };
  }
  return P;
}

// ---- 巨猿 ----
function apeRig() {
  const P = {};
  P.body = { pivot: [0, 7.0, -0.2], shapes: [
    ell([0, 7.4, -0.6], [2.6, 1.9, 2.0], fur), ell([0, 10.2, 0.1], [3.6, 3.4, 2.6], apeBack), ell([0, 12.3, -0.5], [4.0, 1.9, 2.4], apeBack),
    ell([0, 10.6, 2.0], [2.5, 2.2, 0.95], (x, y) => (Math.abs(x) < 0.22 || (y < 9.4 && y > 9.1) ? 59 : 61)), // 胸肌
    ...sym([ell([1.25, 8.4, 2.1], [0.9, 0.5, 0.5], 59)]),
  ] };
  P.head = { parent: "body", pivot: [0, 13.0, 1.0], shapes: [
    ell([0, 14.4, 1.3], [1.95, 1.95, 1.8], fur), ell([0, 16.0, 0.7], [0.6, 0.95, 1.45], 56),
    ell([0, 14.0, 2.5], [1.5, 1.6, 0.95], (x, y, z) => (H(x, y, z) > 0.85 ? 59 : 58)),
    cap([-1.35, 14.95, 3.0], [1.35, 14.95, 3.0], 0.45, 0.45, 56),
    ell([0, 13.35, 3.0], [1.2, 0.9, 0.95], 59), ...sym([ell([0.32, 13.62, 3.88], [0.18, 0.15, 0.15], 56)]),
    ...sym([ell([1.75, 14.2, 1.2], [0.35, 0.55, 0.4], 59)]), // 耳朵
    ...sym([cone([0.5, 12.95, 3.6], [0.5, 12.45, 3.65], 0.15, 46)]), // 上獠牙
  ] };
  P.eyes = { parent: "head", pivot: [0, 14.45, 3.2], shapes: sym([ell([0.66, 14.45, 3.18], [0.32, 0.22, 0.22], 60), ell([0.66, 14.45, 3.38], [0.1, 0.12, 0.08], 50)]) };
  P.jaw = { parent: "head", pivot: [0, 12.95, 2.1], shapes: [
    ell([0, 12.6, 2.6], [1.2, 0.72, 1.0], (x, y, z, rel) => (rel > 0.4 ? 47 : 59)),
    ...sym([cone([0.62, 12.8, 3.3], [0.62, 13.35, 3.35], 0.15, 46), cone([0.28, 12.95, 3.45], [0.28, 13.2, 3.5], 0.11, 46)]),
  ] };
  for (const sd of [1, -1]) {
    const S = sd > 0 ? "L" : "R", X = (v) => v * sd;
    P["arm" + S] = { parent: "body", pivot: [X(3.4), 12.2, 0.2], shapes: [
      ell([X(3.6), 12.1, 0.0], [1.6, 1.5, 1.6], apeBack), cap([X(3.5), 12.0, 0.2], [X(4.45), 7.8, 1.0], 1.45, 1.15, fur),
    ] };
    P["fore" + S] = { parent: "arm" + S, pivot: [X(4.45), 7.8, 1.0], shapes: [
      cap([X(4.45), 7.8, 1.0], [X(4.65), 2.2, 1.6], 1.3, 1.05, (x, y, z, rel) => (y > 5.8 && hash3(Math.floor(x * 5), Math.floor(y * 2), Math.floor(z * 5)) > 0.5 ? 55 : fur(x, y, z, rel))),
      ell([X(4.65), 1.2, 1.75], [1.2, 1.2, 1.3], 59),
      ...[-1.5, -0.5, 0.5, 1.5].map((k) => ell([X(4.65 + k * 0.42), 0.55, 2.55], [0.27, 0.42, 0.3], 62)),
      ell([X(4.0), 1.5, 2.6], [0.3, 0.45, 0.3], 62), // 拇指
    ] };
    P["leg" + S] = { pivot: [X(1.6), 7.0, -0.8], shapes: [cap([X(1.6), 7.2, -0.8], [X(1.95), 3.8, -0.2], 1.45, 1.1, fur)] };
    P["shin" + S] = { parent: "leg" + S, pivot: [X(1.95), 3.8, -0.2], shapes: [
      cap([X(1.95), 3.8, -0.2], [X(1.95), 1.0, -0.6], 1.05, 0.8, fur),
      ell([X(1.95), 0.45, 0.0], [0.95, 0.45, 1.45], 59), ...[-1, 0, 1].map((k) => ell([X(1.95 + k * 0.5), 0.3, 1.35], [0.24, 0.3, 0.28], 62)),
    ] };
  }
  return P;
}

// ---- 晶甲獸 ----
function ankyloRig() {
  const P = {}, sp = [];
  let k = 0;
  for (let z = 4.3; z >= -5.8; z -= 2.0) for (const x of k++ & 1 ? [-1.3, 1.3, -3.2, 3.2] : [0, -2.5, 2.5]) {
    const q = 1 - (x / 4.4) ** 2 - ((z + 0.5) / 7.2) ** 2; if (q <= 0.08) continue;
    const y = 5.4 + 3.0 * Math.sqrt(q) - 0.35, h = 1.2 + 1.5 * Math.sqrt(q) * (1 - Math.abs(x) / 6);
    const s = cone([x, y, z], [x * 1.3, y + h, z - 0.25], 0.5 + h * 0.08, null); s.m = (xx, yy) => crystal(0, 0, 0, 0, (yy - y) / h); sp.push(s);
  }
  const side = [];
  for (let z = 4.0; z >= -5.6; z -= 1.9) for (const sd of [1, -1]) side.push(cone([sd * 4.3, 4.7, z], [sd * 5.8, 4.3, z - 0.35], 0.42, 70));
  P.body = { pivot: [0, 4.6, 0], shapes: [
    ell([0, 5.4, -0.5], [4.4, 3.0, 7.2], plates), ell([0, 4.5, -0.5], [4.85, 1.0, 7.0], (x, y, z) => (H(x, y, z) > 0.6 ? 65 : 63)),
    ...sp, ...side,
  ] };
  P.head = { parent: "body", pivot: [0, 4.6, 6.2], shapes: [
    ell([0, 4.7, 7.7], [2.0, 1.5, 1.8], stone), ell([0, 5.75, 7.5], [1.85, 0.65, 1.55], plates),
    cap([0, 4.3, 8.9], [0, 3.95, 10.1], 1.25, 0.75, (x, y, z, rel) => (rel < -0.2 ? 69 : 65)),
    ...sym([cone([1.6, 5.7, 6.8], [2.7, 6.2, 5.6], 0.36, 70), cone([1.85, 4.2, 7.1], [2.75, 3.6, 6.6], 0.3, 70), ell([0.45, 4.45, 10.0], [0.16, 0.14, 0.14], 65)]),
  ] };
  P.eyes = { parent: "head", pivot: [0, 5.05, 8.4], shapes: sym([ell([1.55, 5.05, 8.4], [0.3, 0.26, 0.34], 68), ell([1.78, 5.05, 8.5], [0.1, 0.2, 0.12], 71)]) };
  P.jaw = { parent: "head", pivot: [0, 3.9, 7.3], shapes: [ell([0, 3.55, 8.5], [1.4, 0.6, 1.5], (x, y, z, rel) => (rel > 0.45 ? 47 : 69)), ...sym([cone([0.7, 3.95, 9.4], [0.7, 4.35, 9.45], 0.12, 70)])] };
  for (const [n, x, z, r] of [["legFL", 2.8, 3.6, 1.25], ["legFR", -2.8, 3.6, 1.25], ["legBL", 2.9, -4.4, 1.45], ["legBR", -2.9, -4.4, 1.45]]) {
    const sd = Math.sign(x);
    P[n] = { pivot: [x, 4.4, z], shapes: [
      cap([x, 4.6, z], [x + sd * 0.3, 0.9, z + 0.3], r, r * 0.8, stone),
      ell([x + sd * 0.3, 0.5, z + 0.5], [r * 0.9, 0.5, r], (xx, yy, zz) => (H(xx, yy, zz) > 0.7 ? 63 : 65)),
      ...[-1, 0, 1].map((k) => cone([x + sd * 0.3 + k * 0.45, 0.3, z + 0.5 + r * 0.85], [x + sd * 0.3 + k * 0.5, 0.1, z + 0.9 + r * 0.85], 0.17, 70)),
    ] };
  }
  const T = [[0, 5.2, -6.6], [0, 4.8, -10.5], [0, 4.4, -14.2], [0, 4.2, -16.2]], TR = [1.8, 1.3, 0.9, 0.8];
  for (let i = 0; i < 3; i++) {
    const a = T[i], b = T[i + 1], sh = [cap(a, b, TR[i], TR[i + 1], plates)];
    for (let u = 0.25; u < 1; u += 0.5) {
      const z = a[2] + (b[2] - a[2]) * u, y = a[1] + (b[1] - a[1]) * u, r = TR[i] + (TR[i + 1] - TR[i]) * u;
      for (const sd of [1, -1]) sh.push(cone([sd * r * 0.8, y + 0.1, z], [sd * (r + 0.9), y + 0.2, z - 0.4], 0.28, 70));
      sh.push(cone([0, y + r - 0.2, z], [0, y + r + 0.45, z - 0.3], 0.3, 66));
    }
    if (i === 2) {
      sh.push(ell([0, 4.2, -17.4], [2.2, 1.4, 1.7], plates));
      for (const [dx, dy, tx, ty] of [[1.6, 0.4, 2.9, 1.0], [-1.6, 0.4, -2.9, 1.0], [0, 1.2, 0, 2.6], [1.0, 1.0, 1.9, 2.1], [-1.0, 1.0, -1.9, 2.1], [0, 0.2, 0, -0.1]]) {
        const s = cone([dx, 4.2 + dy, -17.4], [tx, 4.2 + ty, dy < 0.3 ? -19.3 : -17.6], 0.48, null), y0 = 4.2 + dy, hh = Math.max(0.6, Math.hypot(tx - dx, ty - dy, dy < 0.3 ? 1.9 : 0.2));
        s.m = (xx, yy, zz) => crystal(0, 0, 0, 0, Math.hypot(xx - dx, yy - y0, zz + 17.4) / hh); sh.push(s);
      }
    }
    P["tail" + (i + 1)] = { parent: i ? "tail" + i : "body", pivot: a, shapes: sh };
  }
  return P;
}

export const MONSTERS = {
  trex: { id: "trex", name: "暴龍・雷克斯", img: "img/m_trex.png", stride: 1.0, speed: 10, bodyR: 3.0, rig: trexRig,
    desc: "平衡型：甩尾範圍大", stats: { 速度: 3, 力量: 3, 範圍: 4 }, labels: ["踩踏", "甩尾", "衝撞", "吼叫"],
    stomp: { fwd: 4.5, r: 4.2 }, tail: { dist: 10, r: 3.4, y: 5 }, charge: { fwd: 6, r: 3.6, y: 5, mult: 2.6, dur: 0.7 }, roar: { R: 18, r: 4.5 },
    cd: [0.55, 1.1, 3.0, 7.0], roarSfx: "boss" },
  ape: { id: "ape", name: "巨猿・剛猛", img: "img/m_ape.png", stride: 0.83, speed: 12.5, bodyR: 3.0, rig: apeRig,
    desc: "速度型：移動快、捶地猛", stats: { 速度: 5, 力量: 3, 範圍: 3 }, labels: ["捶地", "橫掃", "衝撞", "捶胸吼"],
    stomp: { fwd: 4, r: 5.0 }, tail: { dist: 5.5, r: 4.0, y: 7 }, charge: { fwd: 5, r: 3.6, y: 7, mult: 2.8, dur: 0.65 }, roar: { R: 15, r: 4.5 },
    cd: [0.5, 0.9, 2.4, 6.5], roarSfx: "roar2" },
  ankylo: { id: "ankylo", name: "晶甲獸・鐵甲", img: "img/m_ankylo.png", stride: 1.0, speed: 7.5, bodyR: 3.8, rig: ankyloRig,
    desc: "重裝型：慢，但破壞範圍最大", stats: { 速度: 2, 力量: 5, 範圍: 5 }, labels: ["重踏", "錘尾", "頭槌", "晶震吼"],
    stomp: { fwd: 6, r: 5.3 }, tail: { dist: 15, r: 4.4, y: 4 }, charge: { fwd: 9, r: 4.4, y: 4, mult: 2.4, dur: 0.8 }, roar: { R: 22, r: 5.0 },
    cd: [0.7, 1.3, 3.4, 8.0], roarSfx: "roar1" },
};
export const MONSTER_ORDER = ["trex", "ape", "ankylo"];

// 把一個部位的形狀點陣化成體素（對齊全域格線，部位之間格子一致）
function rasterPart(shapes, vs) {
  let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
  const bb = shapes.map((s) => {
    const b = bounds(s);
    const g = [Math.floor(b[0] / vs), Math.floor(b[1] / vs), Math.floor(b[2] / vs), Math.floor(b[3] / vs), Math.floor(b[4] / vs), Math.floor(b[5] / vs)];
    if (!s.carve) { x0 = Math.min(x0, g[0]); y0 = Math.min(y0, g[1]); z0 = Math.min(z0, g[2]); x1 = Math.max(x1, g[3]); y1 = Math.max(y1, g[4]); z1 = Math.max(z1, g[5]); }
    return g;
  });
  y0 = Math.max(y0, 0);
  const nx = x1 - x0 + 1, ny = y1 - y0 + 1, nz = z1 - z0 + 1, vox = new Uint8Array(nx * ny * nz);
  shapes.forEach((s, si) => {
    const g = bb[si];
    for (let iy = Math.max(g[1], y0); iy <= Math.min(g[4], y1); iy++) for (let iz = Math.max(g[2], z0); iz <= Math.min(g[5], z1); iz++) for (let ix = Math.max(g[0], x0); ix <= Math.min(g[3], x1); ix++) {
      const x = (ix + 0.5) * vs, y = (iy + 0.5) * vs, z = (iz + 0.5) * vs, rel = inside(s, x, y, z);
      if (rel === null) continue;
      vox[(ix - x0) + (iz - z0) * nx + (iy - y0) * nx * nz] = s.carve ? 0 : typeof s.m === "function" ? s.m(x, y, z, rel) : s.m;
    }
  });
  return { vox, x0, y0, z0, nx, ny, nz };
}

// quality：0 低 / 1 中 / 2 高（決定體素大小）
export function buildMonster(id, mats, opts = {}) {
  const def = MONSTERS[id], P = def.rig(), q = Math.max(0, Math.min(2, opts.quality ?? 2)), vs = MON_LOD[q];
  const root = new THREE.Group(), nodes = {};
  let tris = 0;
  const make = (n) => {
    if (nodes[n]) return nodes[n];
    const p = P[n], g = new THREE.Group(); g.name = n;
    const r = rasterPart(p.shapes, vs), { vox, nx, ny, nz } = r;
    const get = (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz ? 0 : vox[x + z * nx + y * nx * nz]);
    const res = meshVoxels(get, 0, 0, 0, nx, ny, nz, 0, 0, 0);
    for (const [j, mat] of [[0, mats.mon], [1, mats.monGlow]]) {
      const geo = toGeometry(res[j]); if (!geo) continue;
      const ms = new THREE.Mesh(geo, mat); ms.castShadow = j === 0; ms.scale.setScalar(vs);
      ms.position.set(r.x0 * vs - p.pivot[0], r.y0 * vs - p.pivot[1], r.z0 * vs - p.pivot[2]); g.add(ms); tris += geo.index.count / 3;
    }
    const par = p.parent ? make(p.parent) : null, pp = p.parent ? P[p.parent].pivot : [0, 0, 0];
    g.position.set(p.pivot[0] - pp[0], p.pivot[1] - pp[1], p.pivot[2] - pp[2]);
    (par || root).add(g); nodes[n] = g; g.userData.base = g.position.clone();
    return g;
  };
  for (const n of Object.keys(P)) make(n);
  root.userData.nodes = nodes; root.userData.lod = q; root.userData.tris = tris;
  return root;
}
