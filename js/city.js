// 三個城市場景的程序生成（固定亂數種子 → 每次一樣的城市，方便比較分數）
// v1.1：體素 0.5 公尺一格。版面配置用公尺，細節（窗框、陽台、遮雨棚、招牌、屋頂設備、車輛、路燈）用體素格雕出來。
import { W, D, H, RES, defineMat } from "./world.js";

export function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const ROADS = [0, 24, 48, 72, 96];

export const SCENES = {
  downtown: { id: "downtown", name: "現代市中心", sub: "玻璃摩天樓林立的白天都會", img: "img/s_downtown.jpg", music: "level1", seed: 1101, time: 90, stars: [0.3, 0.55, 0.8],
    sky: ["#3f8fe8", "#a9d4ff", "#e4f2ff"], fog: 0xd4e6f6, fogNear: 70, fogFar: 230, sun: 0xfff2dc, sunI: 2.4, sunDir: [-0.55, 1, 0.4], hemi: [0xcfe6ff, 0x6b6152, 1.25], ground: 0x6f7a62, sky2: 0x8fa3b8, night: false },
  harbor: { id: "harbor", name: "黃昏海港", sub: "貨櫃、起重機與紅磚倉庫", img: "img/s_harbor.jpg", music: "level2", seed: 2202, time: 90, stars: [0.3, 0.55, 0.8],
    sky: ["#2f3f86", "#ff8f5a", "#ffd9a0"], fog: 0xf2b48a, fogNear: 70, fogFar: 230, sun: 0xffc48a, sunI: 2.5, sunDir: [0.9, 0.55, -0.3], hemi: [0xffd2b0, 0x4a4050, 1.1], ground: 0x5d6168, sky2: 0x7a5a70, night: false },
  neon: { id: "neon", name: "霓虹夜城", sub: "不夜城的霓虹高塔", img: "img/s_neon.jpg", music: "boss", seed: 3303, time: 90, stars: [0.3, 0.55, 0.8],
    sky: ["#030314", "#1a0b3a", "#3a1450"], fog: 0x1c0f34, fogNear: 60, fogFar: 200, sun: 0x9fb0ff, sunI: 0.9, sunDir: [-0.4, 1, -0.5], hemi: [0x5a60c0, 0x1a0c22, 0.9], ground: 0x1a1a24, sky2: 0x140a26, night: true },
};
export const SCENE_ORDER = ["downtown", "harbor", "neon"];

// ---- 細節材質（72 起；s = 每平方公尺的分數）----
defineMat(72, 0xe9e5da, { s: 10 }); // 窗框、窗台
defineMat(73, 0xc8392f, { s: 12 }); defineMat(74, 0x2f8f5a, { s: 12 }); defineMat(75, 0x2f6db5, { s: 12 }); // 遮雨棚
defineMat(76, 0xb9bcc0, { s: 15 }); defineMat(77, 0x464a51, { s: 15 }); // 冷氣主機、格柵
defineMat(78, 0x8a6440, { s: 12 }); defineMat(79, 0xff3a3a, { s: 15, g: 1 }); // 水塔、避雷燈
defineMat(81, 0xd2d4d6, { s: 10 }); // 陽台欄杆
defineMat(83, 0x9c2e22, { s: 15 }); defineMat(84, 0x24548c, { s: 15 }); defineMat(85, 0x2e7a3a, { s: 15 }); defineMat(86, 0xb8661e, { s: 15 }); // 貨櫃壓紋
defineMat(87, 0xffd23a, { s: 25, g: 1 }); defineMat(88, 0xf2f4ff, { s: 25, g: 1 }); // 招牌
defineMat(90, 0xfff3b8, { s: 30, g: 1, p: 1, n: "car" }); defineMat(91, 0xff2a2a, { s: 30, g: 1, p: 1, n: "car" }); // 車燈
defineMat(92, 0x2c7a2e, { s: 5, p: 1 }); // 深色樹葉
defineMat(93, 0x7d7a74, { s: 8 }); // 屋頂碎石
defineMat(97, 0x9a4630, { s: 10 }); defineMat(98, 0x56565c, { s: 10 }); // 深色磚、深色飾帶
defineMat(99, 0x22262c, { s: 20 }); // 太陽能板
const DARK = { 8: 83, 9: 84, 10: 85, 11: 86 };

const R_ = RES;
function vb(w, x0, y0, z0, x1, y1, z1, m, b = 0) { for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) w.set(x, y, z, m, b); }
function hashW(x, y, z) { let h = (x * 73856093) ^ (y * 19349663) ^ (z * 83492791); h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
// 四面外牆：u = 沿牆索引，d = 往外幾格
function sides(X0, Z0, X1, Z1) {
  return [
    { len: X1 - X0 + 1, at: (u, d) => [X0 + u, Z0 - d] }, { len: X1 - X0 + 1, at: (u, d) => [X0 + u, Z1 + d] },
    { len: Z1 - Z0 + 1, at: (u, d) => [X0 - d, Z0 + u] }, { len: Z1 - Z0 + 1, at: (u, d) => [X1 + d, Z0 + u] },
  ];
}

const FH = 7; // 樓高 3.5 公尺
// 建築：外牆＋每層樓板（中空 → 打破後看得到內部樓層），再加外牆與屋頂細節
function building(w, R, x0, z0, sx, sz, h, style) {
  h = Math.min(h, H - 4);
  const X0 = x0 * R_, Z0 = z0 * R_, X1 = (x0 + sx) * R_ - 1, Z1 = (z0 + sz) * R_ - 1, HV = h * R_;
  const B = w.newBuilding(X0 - 2, Z0 - 2, X1 + 2, Z1 + 2, style);
  // 版面用的亂數 R 與 v1.0 消耗次數完全相同（同一座城市配置）；外牆、屋頂細節用每棟自己的亂數 RD
  const RD = rng(x0 * 7919 + z0 * 131 + h * 17 + 1), pal = STYLE[style](R, RD);
  for (let y = 0; y < HV; y++) for (let z = Z0; z <= Z1; z++) for (let x = X0; x <= X1; x++) {
    const ex = x === X0 || x === X1, ez = z === Z0 || z === Z1, edge = ex || ez, corner = ex && ez;
    const slab = y % FH === 0 || y === HV - 1;
    if (!edge && !slab) continue;
    // 樓板只做靠外牆 2 公尺寬的一圈（從窗戶與破口看得到樓層，又少掉大量看不到的面）；屋頂是整片
    if (!edge && y !== HV - 1 && Math.min(x - X0, X1 - x, z - Z0, Z1 - z) > 4) continue;
    let m;
    if (!edge) m = y === HV - 1 ? (hashW(x, y, z) < 0.25 ? 93 : pal.roof) : 2;
    else { const u = ex ? z - Z0 : x - X0; m = pal.facade(x, y, z, u, corner, y % FH, (y / FH) | 0, HV); }
    w.set(x, y, z, m, B.id);
  }
  // 女兒牆（1 公尺高，頂部壓條）
  for (let z = Z0; z <= Z1; z++) for (let x = X0; x <= X1; x++) if (x === X0 || x === X1 || z === Z0 || z === Z1) { w.set(x, HV, z, pal.rim, B.id); w.set(x, HV + 1, z, pal.cap || pal.rim, B.id); }
  const S = sides(X0, Z0, X1, Z1), ctx = { X0, Z0, X1, Z1, HV, S, B };
  if (pal.extras) pal.extras(w, RD, ctx);
  roofStuff(w, RD, ctx, pal, h);
  // 與 v1.0 相同的亂數消耗（屋頂機組、天線、霓虹看板）
  if (sx >= 6 && sz >= 6 && R() < 0.8) { R(); R(); }
  if (h > 28 && R() < 0.7) R();
  if (style === "neon" && sx >= 6 && R() >= 0.45) R();
  return B;
}
// 屋頂設備：冷氣主機、水塔、樓梯間、天線、太陽能板
function roofStuff(w, R, c, pal, hm) {
  const { X0, Z0, X1, Z1, HV, B } = c, sx = X1 - X0 + 1, sz = Z1 - Z0 + 1, y = HV;
  const free = (x, z, a, b) => { for (let i = x; i < x + a; i++) for (let k = z; k < z + b; k++) if (w.vat(i, y, k)) return false; return true; };
  const place = (a, b, fn) => { for (let t = 0; t < 12; t++) { const x = X0 + 2 + ((R() * (sx - a - 3)) | 0), z = Z0 + 2 + ((R() * (sz - b - 3)) | 0); if (sx - a - 3 > 0 && sz - b - 3 > 0 && free(x - 1, z - 1, a + 2, b + 2)) { fn(x, z); return true; } } return false; };
  if (sx >= 10 && sz >= 10) place(4, 4, (x, z) => { vb(w, x, y, z, x + 3, y + 4, z + 3, pal.rim, B.id); vb(w, x + 1, y, z, x + 2, y + 2, z, 77, B.id); }); // 樓梯間
  const ac = Math.min(5, ((sx * sz) / 60) | 0);
  for (let i = 0; i < ac; i++) place(3, 2, (x, z) => { vb(w, x, y, z, x + 2, y + 1, z + 1, 76, B.id); w.set(x + 1, y + 2, z, 77, B.id); w.set(x + 1, y + 2, z + 1, 77, B.id); });
  if ((pal.tank && R() < 0.75) && sx >= 10) place(5, 5, (x, z) => { // 木造水塔
    for (const [a, b] of [[0, 0], [4, 0], [0, 4], [4, 4]]) vb(w, x + a, y, z + b, x + a, y + 2, z + b, 16, B.id);
    for (let yy = y + 3; yy <= y + 8; yy++) for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) { const d = (a - 2) ** 2 + (b - 2) ** 2; if (d <= 5) w.set(x + a, yy, z + b, yy % 3 === 0 ? 16 : 78, B.id); }
    w.set(x + 2, y + 9, z + 2, 78, B.id);
  });
  if (pal.solar && sx >= 12) place(6, 4, (x, z) => { for (let a = 0; a < 6; a++) for (let b = 0; b < 4; b++) w.set(x + a, y + (b >> 1), z + b, (a + b) % 4 === 0 ? 81 : 99, B.id); });
  if (HV > 50 && R() < 0.75) { // 天線＋避雷燈
    const x = X0 + (sx >> 1), z = Z0 + (sz >> 1), t = 10 + ((R() * 14) | 0);
    if (w.vat(x, y, z)) return;
    vb(w, x, y, z, x, y + t, z, 6, B.id); vb(w, x - 1, y, z - 1, x + 1, y + 1, z + 1, 98, B.id); w.set(x, y + t + 1, z, 79, B.id);
    for (let k = 4; k < t; k += 5) { w.set(x + 1, y + k, z, 6, B.id); w.set(x - 1, y + k, z, 6, B.id); }
  }
}
// 陽台：樓板外推 1 格＋欄杆
function balconies(w, R, c, bay, prob, mat = 81) {
  const { HV, S, B } = c;
  for (const sd of S) for (let s = 1; s * FH < HV - 2; s++) {
    if (R() > prob) continue;
    const y = s * FH;
    for (let u0 = 1; u0 + bay <= sd.len - 1; u0 += bay * 2) {
      for (let u = u0; u < u0 + bay; u++) {
        const [ax, az] = sd.at(u, 1), [bx, bz] = sd.at(u, 2);
        w.set(ax, y, az, 25, B.id); w.set(bx, y, bz, 25, B.id);
        w.set(bx, y + 2, bz, mat, B.id); if ((u & 1) === 0 || u === u0 || u === u0 + bay - 1) w.set(bx, y + 1, bz, mat, B.id);
      }
    }
  }
}
// 一樓：遮雨棚（條紋）＋小招牌
function storefront(w, R, c, night) {
  const { S, B } = c;
  for (const sd of S) {
    if (R() < 0.35) continue;
    const col = [73, 74, 75][(R() * 3) | 0], a = 1 + ((R() * 3) | 0), len = Math.min(sd.len - 2 - a, 6 + ((R() * 8) | 0));
    for (let u = a; u < a + len; u++) {
      const st = (u & 1) ? col : 72;
      const [x1, z1] = sd.at(u, 1), [x2, z2] = sd.at(u, 2);
      w.set(x1, 6, z1, st, B.id); w.set(x2, 5, z2, st, B.id);
      if (u >= a + 1 && u < a + len - 1) w.set(x1, 7, z1, night || R() < 0.5 ? 87 : 88, B.id);
    }
  }
}
const STYLE = {
  glass(R, RD) {
    const g = R() < 0.5 ? 3 : 29, sp = RD() < 0.5 ? 24 : 25;
    return { roof: 5, rim: 25, cap: 72,
      facade: (x, y, z, u, c, fy, s) => c ? 25 : fy === 0 ? sp : u % 6 === 0 ? 25 : (s === 0 && fy >= 5) ? 98 : g,
      extras: (w, R, c) => { if (c.HV > 60) for (const sd of c.S) for (let u = 0; u < sd.len; u += 6) { const [x, z] = sd.at(u, 1); for (let y = FH; y < c.HV; y++) if (y % FH !== 0) w.set(x, y, z, 72, c.B.id); } }, // 外凸直向鰭片
    };
  },
  office(R, RD) {
    const wall = R() < 0.5 ? 1 : 28, trim = RD() < 0.5 ? 72 : 98, bal = RD() < 0.55;
    return { roof: 5, rim: wall, cap: trim, tank: true,
      facade: (x, y, z, u, c, fy, s) => {
        if (c) return wall;
        if (s === 0) return fy >= 1 && fy <= 5 && u % 8 !== 0 ? 3 : fy === 6 ? trim : wall; // 一樓店面
        const bay = u % 4;
        if (fy === 0) return trim;
        if (bay === 1 || bay === 2) return fy >= 2 && fy <= 5 ? 3 : fy === 1 ? 72 : wall;
        return wall;
      },
      extras: (w, R, c) => { storefront(w, R, c, false); if (bal) balconies(w, R, c, 4, 0.5); },
    };
  },
  brick(R) {
    return { roof: 31, rim: 4, cap: 72, tank: true, solar: true,
      facade: (x, y, z, u, c, fy, s) => {
        if (c) return 97;
        if (s === 0) return fy >= 1 && fy <= 5 && u % 6 !== 0 ? 3 : 4;
        const bay = u % 5;
        if ((bay === 1 || bay === 2) && fy >= 2 && fy <= 5) return 3;
        if ((bay === 1 || bay === 2) && (fy === 1 || fy === 6)) return 72;
        return (y + ((u >> 1) & 1)) % 3 === 0 ? 97 : 4; // 磚縫
      },
      extras: (w, R, c) => { storefront(w, R, c, false); balconies(w, R, c, 2, 0.35, 16); },
    };
  },
  neon(R) {
    const n = [21, 22, 30][(R() * 3) | 0], n2 = [21, 22, 30][(R() * 3) | 0];
    return { roof: 23, rim: n, cap: 23,
      facade: (x, y, z, u, c, fy, s) => c ? n : (s % 3 === 1 && fy === 0) ? n2 : (fy >= 2 && fy <= 4) && u % 3 === 1 ? (hashW(x, y, z) < 0.55 ? 20 : 24) : 23,
      extras: (w, R, c) => {
        storefront(w, R, c, true);
        const { S, HV, B } = c;
        for (const sd of S) { // 直立霓虹招牌
          if (R() < 0.45 || sd.len < 10) continue;
          const u = 3 + ((R() * (sd.len - 6)) | 0), y0 = FH * 2, y1 = Math.min(HV - 3, y0 + 14 + ((R() * 10) | 0)), cc = [21, 22, 30, 87][(R() * 4) | 0];
          for (let y = y0; y <= y1; y++) for (let d = 1; d <= 3; d++) { const [x, z] = sd.at(u, d); const fr = d === 3 || y === y0 || y === y1; w.set(x, y, z, fr ? cc : (y % 3 === 0 ? 88 : 23), B.id); }
        }
        if (R() < 0.6 && c.X1 - c.X0 > 10) { // 屋頂看板
          const zz = (c.Z0 + c.Z1) >> 1, xa = c.X0 + 2, xb = Math.min(c.X1 - 2, xa + 16), cc = [21, 22, 30][(R() * 3) | 0];
          for (let y = HV + 2; y <= HV + 10; y++) for (let x = xa; x <= xb; x++) { const fr = y === HV + 2 || y === HV + 10 || x === xa || x === xb; w.set(x, y, zz, fr ? cc : hashW(x, y, 7) < 0.4 ? cc : 23, B.id); }
          vb(w, xa + 2, HV, zz + 1, xa + 2, HV + 6, zz + 1, 6, B.id); vb(w, xb - 2, HV, zz + 1, xb - 2, HV + 6, zz + 1, 6, B.id);
        }
      },
    };
  },
  warehouse(R) {
    return { roof: 31, rim: 4, cap: 98, solar: true,
      facade: (x, y, z, u, c, fy, s, HV) => {
        if (c) return 98;
        if (y < 9 && u % 16 >= 3 && u % 16 <= 10) return y === 8 ? 98 : y % 2 ? 2 : 6; // 捲門
        if (y >= HV - 4 && y <= HV - 3 && u % 6 >= 2 && u % 6 <= 3) return 3; // 高側窗
        return u % 2 ? 4 : 97; // 浪板
      },
    };
  },
};

// ---- 小物件（車、路燈、樹）：體素座標 ----
function tree(w, X, Z, R) {
  const q = R(), t = 4 + (q < 0.5 ? 0 : 1), r = 2.2 + hashW(X, Z, 3) * 0.9;
  vb(w, X, 0, Z, X, t, Z, 18);
  for (let y = t - 1; y <= t + 2 * r + 1; y++) for (let z = Z - 3; z <= Z + 3; z++) for (let x = X - 3; x <= X + 3; x++) {
    const d = ((x - X) ** 2 + (z - Z) ** 2) / (r * r) + ((y - t - r) ** 2) / ((r + 0.6) ** 2);
    if (d <= 1 && hashW(x, y, z) > 0.08) w.set(x, y, z, hashW(x + 3, y, z) < 0.35 || y < t + r - 1 ? 92 : 19);
  }
}
function lamp(w, X, Z, dx, dz) {
  vb(w, X, 0, Z, X, 10, Z, 16); w.set(X, 0, Z + 0, 16);
  for (let k = 1; k <= 3; k++) w.set(X + dx * k, 10, Z + dz * k, 16);
  w.set(X + dx * 3, 9, Z + dz * 3, 17);
}
function car(w, X, Z, alongX, m) { // 1.5×4 公尺：輪子、車身、車窗、頭燈、尾燈
  const L = 8, Wd = 3;
  const put = (l, y, s, mm) => (alongX ? w.set(X + l, y, Z + s, mm) : w.set(X + s, y, Z + l, mm));
  for (let l = 0; l < L; l++) for (let s = 0; s < Wd; s++) {
    const wheel = (l === 1 || l === L - 2) && s !== 1;
    put(l, 0, s, wheel ? 15 : m);
    put(l, 1, s, l === L - 1 ? (s === 1 ? m : 90) : l === 0 ? (s === 1 ? m : 91) : m);
    if (l >= 2 && l <= 5) put(l, 2, s, (l === 2 || l === 5) && s === 1 ? 15 : s === 1 && l > 2 && l < 5 ? m : 15);
  }
  for (let l = 3; l <= 4; l++) for (let s = 0; s < Wd; s++) put(l, 3, s, m);
}
function sidewalkProps(w, R) {
  for (const c of ROADS) for (let t = 6; t < 96; t += 8) {
    if (ROADS.some((r) => Math.abs(t - r) < 5)) continue;
    if (c > 0) lamp(w, (c - 4) * R_, t * R_, 1, 0);
    if (c < 96) lamp(w, t * R_, (c + 3) * R_ + 1, 0, -1);
    if (c > 0 && hashW(c, t, 5) < 0.4) vb(w, (c - 4) * R_ + 1, 0, (t + 3) * R_, (c - 4) * R_ + 1, 1, (t + 3) * R_, 8); // 消防栓
  }
}
function parking(w, R, x0, z0) { for (let r = 0; r < 3; r++) for (let k = 0; k < 6; k++) if (R() < 0.75) car(w, (x0 + 1 + k * 2 + (k > 2 ? 1 : 0)) * R_, (z0 + 1 + r * 5) * R_, false, [12, 13, 14][(R() * 3) | 0]); }
function park(w, R, x0, z0) { for (let i = 0; i < 7; i++) tree(w, (x0 + 2 + R() * 12) * R_ | 0, (z0 + 2 + R() * 12) * R_ | 0, R); }

// 每個街廓 = [x0, z0]（16×16 公尺的可建區）
function blocks() { const b = []; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) b.push([ROADS[i] + 4, ROADS[j] + 4, i, j]); return b; }

function container(w, R, sx, sz, B) { // 4×7 公尺貨櫃，最多疊 3 層，側面壓紋、端門
  const n = 1 + ((R() * 3) | 0), X0 = sx * R_, Z0 = sz * R_, X1 = X0 + 7, Z1 = Z0 + 13;
  for (let k = 0; k < n; k++) {
    const m = [8, 9, 10, 11][(R() * 4) | 0], dk = DARK[m], y0 = k * 6;
    for (let y = y0; y < y0 + 6; y++) for (let z = Z0; z <= Z1; z++) for (let x = X0; x <= X1; x++) {
      const ex = x === X0 || x === X1, ez = z === Z0 || z === Z1;
      if (!ex && !ez && y !== y0 && y !== y0 + 5) continue;
      w.set(x, y, z, ez ? (x % 2 ? dk : 2) : y === y0 + 5 || y === y0 ? dk : z % 2 ? m : dk, B.id);
    }
  }
}
function crane(w, cz) {
  const B = w.newBuilding(118, (cz - 3) * R_, 185, (cz + 3) * R_, "crane"), Y = 52, X0 = 128, Z0 = (cz - 1) * R_;
  for (let y = 0; y < Y; y++) for (const [dx, dz] of [[0, 0], [7, 0], [0, 7], [7, 7]]) w.set(X0 + dx, y, Z0 + dz, 7, B.id);
  for (let y = 0; y < Y; y += 6) for (let k = 0; k < 8; k++) { w.set(X0 + k, y, Z0, 7, B.id); w.set(X0 + k, y, Z0 + 7, 7, B.id); w.set(X0, y, Z0 + k, 7, B.id); w.set(X0 + 7, y, Z0 + k, 7, B.id); }
  for (let y = 0; y < Y - 6; y += 6) for (let k = 1; k < 6; k++) { const kk = Math.round(k * 7 / 6); w.set(X0 + kk, y + k, Z0, 7, B.id); w.set(X0 + 7 - kk, y + k, Z0 + 7, 7, B.id); w.set(X0, y + k, Z0 + kk, 7, B.id); w.set(X0 + 7, y + k, Z0 + 7 - kk, 7, B.id); }
  const bz = cz * R_; // 吊臂：桁架
  for (let x = 120; x <= 184; x++) for (let dz = 0; dz < 4; dz++) {
    const ez = dz === 0 || dz === 3;
    w.set(x, Y, bz + dz, ez || x % 4 === 0 ? 7 : 0, B.id); w.set(x, Y + 3, bz + dz, ez || x % 4 === 2 ? 7 : 0, B.id);
    if (ez && (x % 4 === 0 || (x + Y) % 4 === 1)) { w.set(x, Y + 1, bz + dz, 7, B.id); w.set(x, Y + 2, bz + dz, 7, B.id); }
  }
  vb(w, 120, Y - 3, bz, 124, Y - 1, bz + 3, 2, B.id); // 配重
  vb(w, 128, Y + 4, bz - 1, 134, Y + 8, bz + 4, 6, B.id); vb(w, 129, Y + 6, bz + 4, 133, Y + 7, bz + 4, 3, B.id); // 駕駛室
  vb(w, 172, 34, bz + 1, 172, Y - 1, bz + 1, 16, B.id); vb(w, 170, 30, bz, 174, 33, bz + 2, 8, B.id); // 吊鉤
  return B;
}
function ship(w, R, sz, c) {
  const Z0 = sz * R_, Z1 = (sz + 23) * R_ - 1, X0 = 152, X1 = 183;
  const B = w.newBuilding(X0, Z0, X1, Z1, "ship");
  for (let y = 0; y < 10; y++) for (let z = Z0; z <= Z1; z++) {
    const taper = z < Z0 + 7 ? Math.round((Z0 + 7 - z) * 1.6) : 0, xa = X0 + taper, xb = X1 - taper; if (xa > xb) continue;
    for (let x = xa; x <= xb; x++) {
      const edge = x === xa || x === xb || z === Z0 || z === Z1 || y === 0 || y === 9;
      if (edge) w.set(x, y, z, y === 9 && !(x === xa || x === xb) ? 26 : y < 3 ? 31 : y === 7 ? 25 : c, B.id);
    }
  }
  for (let k = 0; k < 3; k++) { const m = [8, 9, 10, 11][(R() * 4) | 0], dk = DARK[m]; const za = Z0 + 9 + k * 10; for (let y = 10; y < 14; y++) for (let z = za; z < za + 8; z++) for (let x = 156; x <= 179; x++) w.set(x, y, z, z % 2 ? m : dk, B.id); }
  for (let y = 10; y < 24; y++) for (let z = Z0 + 36; z <= Z0 + 43; z++) for (let x = 158; x <= 173; x++) { // 艦橋
    const e = x === 158 || x === 173 || z === Z0 + 36 || z === Z0 + 43; if (!e && y !== 23) continue;
    w.set(x, y, z, e && y % 4 === 2 && y > 12 ? 3 : 32, B.id);
  }
  vb(w, 164, 24, Z0 + 38, 167, 31, Z0 + 41, 31, B.id); vb(w, 164, 29, Z0 + 38, 167, 29, Z0 + 41, 25, B.id); // 煙囪
}

export function generate(w, id) {
  const S = SCENES[id], R = rng(S.seed);
  const info = { roads: ROADS, lanes: [], spawn: [48, 48], water: null, parks: [], lots: [] };
  if (id === "downtown") {
    for (const [x0, z0, i, j] of blocks()) {
      const center = (i === 1 || i === 2) && (j === 1 || j === 2);
      const r = R();
      if (!center && r < 0.12) { park(w, R, x0, z0); info.parks.push([x0, z0]); continue; }
      if (!center && r < 0.2) { parking(w, R, x0, z0); info.lots.push([x0, z0]); continue; }
      const tall = center ? 1 : 0.55;
      const t = R();
      if (t < 0.35) building(w, R, x0 + 2, z0 + 2, 12, 12, (22 + R() * 26 * tall) | 0, center || R() < 0.5 ? "glass" : "office");
      else if (t < 0.7) { building(w, R, x0, z0, 16, 7, (10 + R() * 22 * tall) | 0, R() < 0.5 ? "office" : "glass"); building(w, R, x0, z0 + 9, 16, 7, (8 + R() * 20 * tall) | 0, R() < 0.6 ? "office" : "brick"); }
      else for (let a = 0; a < 2; a++) for (let c = 0; c < 2; c++) building(w, R, x0 + a * 9, z0 + c * 9, 7, 7, (6 + R() * 18 * tall) | 0, ["office", "brick", "glass"][(R() * 3) | 0]);
    }
    sidewalkProps(w, R);
  } else if (id === "harbor") {
    info.water = 72; info.spawn = [24, 48];
    for (const [x0, z0, i, j] of blocks()) {
      if (i === 3) continue; // 東側是碼頭與海
      if (i === 2) { // 貨櫃場
        for (let a = 0; a < 3; a++) for (let c = 0; c < 2; c++) { const sx = x0 + a * 6, sz = z0 + c * 9; container(w, R, sx, sz, w.newBuilding(sx * R_, sz * R_, sx * R_ + 7, sz * R_ + 13, "container")); }
        continue;
      }
      const t = R();
      if (t < 0.55) building(w, R, x0, z0 + 1, 16, 14, (7 + R() * 5) | 0, "warehouse");
      else if (t < 0.8) { building(w, R, x0 + 1, z0 + 1, 7, 14, (10 + R() * 14) | 0, "brick"); building(w, R, x0 + 9, z0 + 1, 7, 14, (12 + R() * 16) | 0, "office"); }
      else { parking(w, R, x0, z0); info.lots.push([x0, z0]); }
    }
    for (const cz of [10, 34, 58, 82]) crane(w, cz); // 起重機
    for (const [sz, c] of [[16, 31], [60, 9]]) ship(w, R, sz, c); // 貨輪
    for (let t = 6; t < 96; t += 8) { if (ROADS.some((r) => Math.abs(t - r) < 5)) continue; if (t < 66) lamp(w, t * R_, 51 * R_, 0, -1); lamp(w, 20 * R_, t * R_, 1, 0); }
    for (let i = 0; i < 6; i++) tree(w, (4 + R() * 40) * R_ | 0, 3, R);
  } else {
    for (const [x0, z0, i, j] of blocks()) {
      const center = (i === 1 || i === 2) && (j === 1 || j === 2);
      const t = R(), tall = center ? 1 : 0.7;
      if (t < 0.4) building(w, R, x0 + 1, z0 + 1, 14, 14, (24 + R() * 24 * tall) | 0, "neon");
      else if (t < 0.75) { building(w, R, x0, z0, 7, 16, (14 + R() * 28 * tall) | 0, "neon"); building(w, R, x0 + 9, z0, 7, 16, (12 + R() * 26 * tall) | 0, R() < 0.7 ? "neon" : "brick"); }
      else for (let a = 0; a < 2; a++) for (let c = 0; c < 2; c++) building(w, R, x0 + a * 9, z0 + c * 9, 7, 7, (8 + R() * 22 * tall) | 0, R() < 0.75 ? "neon" : "office");
    }
    sidewalkProps(w, R);
  }
  // 車道（車流用）：每條內部道路兩個方向（公尺）
  const maxX = info.water ? 72 : 96;
  for (const c of ROADS) {
    if (c === 0 || c === 96) continue;
    if (!info.water || c < 72) { info.lanes.push({ ax: "z", c: c - 1.5, dir: 1, max: 96 }, { ax: "z", c: c + 1.5, dir: -1, max: 96 }); }
    info.lanes.push({ ax: "x", c: c - 1.5, dir: 1, max: maxX - 2 }, { ax: "x", c: c + 1.5, dir: -1, max: maxX - 2 });
  }
  return info;
}

// 地面貼圖（道路、斑馬線、人行道、草地、水）
export function paintGround(id, info) {
  const S = SCENES[id], N = 1024, k = N / W, cv = document.createElement("canvas"); cv.width = cv.height = N;
  const g = cv.getContext("2d");
  const night = S.night;
  g.fillStyle = night ? "#2a2833" : id === "harbor" ? "#8d8b86" : "#9c9a93"; g.fillRect(0, 0, N, N); // 街廓（人行廣場）
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${night ? "120,110,160" : "60,60,60"},${Math.random() * 0.08})`; g.fillRect(Math.random() * N, Math.random() * N, k * (0.5 + Math.random()), k * (0.5 + Math.random())); }
  for (const [x0, z0] of info.parks) { g.fillStyle = "#4e9a3c"; g.fillRect(x0 * k, z0 * k, 16 * k, 16 * k); }
  for (const [x0, z0] of info.lots) { g.fillStyle = night ? "#22222a" : "#55575c"; g.fillRect(x0 * k, z0 * k, 16 * k, 16 * k); g.strokeStyle = "#e8e8e8"; g.lineWidth = 2; for (let x = 0; x <= 16; x += 2) { g.beginPath(); g.moveTo((x0 + x) * k, z0 * k); g.lineTo((x0 + x) * k, (z0 + 16) * k); g.stroke(); } }
  const road = night ? "#15151c" : "#3b3d42";
  const maxX = info.water || 96;
  for (const c of ROADS) {
    g.fillStyle = night ? "#3a3448" : "#c9c5bb"; g.fillRect((c - 4) * k, 0, 8 * k, N); g.fillRect(0, (c - 4) * k, maxX * k, 8 * k);
  }
  for (const c of ROADS) { g.fillStyle = road; g.fillRect((c - 3) * k, 0, 6 * k, N); g.fillRect(0, (c - 3) * k, maxX * k, 6 * k); }
  // 中線與斑馬線
  g.fillStyle = "#f2c230";
  for (const c of ROADS) for (let t = 0; t < 96; t += 3) { if (ROADS.some((r) => Math.abs(t + 0.75 - r) < 3.5)) continue; g.fillRect((c - 0.1) * k, t * k, 0.2 * k, 1.5 * k); if (t < maxX) g.fillRect(t * k, (c - 0.1) * k, 1.5 * k, 0.2 * k); }
  g.fillStyle = "rgba(240,240,240,.9)";
  for (const a of ROADS) for (const b of ROADS) { if (a > maxX) continue; for (let s = -2.5; s <= 2.5; s += 1) { g.fillRect((a + s - 0.3) * k, (b - 4.6) * k, 0.6 * k, 1.4 * k); g.fillRect((a + s - 0.3) * k, (b + 3.2) * k, 0.6 * k, 1.4 * k); g.fillRect((a - 4.6) * k, (b + s - 0.3) * k, 1.4 * k, 0.6 * k); g.fillRect((a + 3.2) * k, (b + s - 0.3) * k, 1.4 * k, 0.6 * k); } }
  if (info.water) {
    g.fillStyle = "#8a6a46"; g.fillRect((info.water - 4) * k, 0, 4 * k, N);
    for (let z = 0; z < 96; z += 1) { g.fillStyle = z % 2 ? "#7a5a38" : "#94724c"; g.fillRect((info.water - 4) * k, z * k, 4 * k, 0.9 * k); }
    const gr = g.createLinearGradient(info.water * k, 0, N, 0); gr.addColorStop(0, "#2a6f9e"); gr.addColorStop(1, "#1d4f7c");
    g.fillStyle = gr; g.fillRect(info.water * k, 0, N - info.water * k, N);
    g.strokeStyle = "rgba(255,220,170,.35)"; g.lineWidth = 2;
    for (let i = 0; i < 260; i++) { const x = info.water * k + Math.random() * (N - info.water * k), y = Math.random() * N; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 8 + Math.random() * 16, y); g.stroke(); }
  }
  if (night) { for (let i = 0; i < 160; i++) { const c = ["255,63,180", "47,240,255", "163,107,255"][i % 3]; const x = Math.random() * N, y = Math.random() * N, r = 6 + Math.random() * 22; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${c},.35)`); gr.addColorStop(1, `rgba(${c},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); } }
  return cv;
}
