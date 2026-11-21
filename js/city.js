// 三個城市場景的程序生成（固定亂數種子 → 每次一樣的城市，方便比較分數）
import { W, D, H } from "./world.js";

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

function box(w, x0, y0, z0, x1, y1, z1, m, b = 0) { for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) w.set(x, y, z, m, b); }

// 建築：外牆＋每 FH 層樓板（中空 → 打破後看得到內部樓層）
function building(w, R, x0, z0, sx, sz, h, style) {
  h = Math.min(h, H - 4);
  const x1 = x0 + sx - 1, z1 = z0 + sz - 1, FH = 4;
  const B = w.newBuilding(x0, z0, x1, z1, style);
  const pal = STYLE[style](R);
  for (let y = 0; y < h; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    const ex = x === x0 || x === x1, ez = z === z0 || z === z1, edge = ex || ez, corner = ex && ez;
    const slab = y % FH === 0 || y === h - 1;
    if (!edge && !slab) continue;
    let m;
    if (!edge) m = y === h - 1 ? pal.roof : 2;
    else { const u = ex ? z - z0 : x - x0; m = pal.facade(x, y, z, u, corner, y % FH, h); }
    w.set(x, y, z, m, B.id);
  }
  // 女兒牆與屋頂設施
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (x === x0 || x === x1 || z === z0 || z === z1) w.set(x, h, z, pal.rim, B.id);
  if (sx >= 6 && sz >= 6 && R() < 0.8) { const ax = x0 + 1 + ((R() * (sx - 4)) | 0), az = z0 + 1 + ((R() * (sz - 4)) | 0); box(w, ax, h, az, ax + 1, h + 1, az + 1, pal.unit || 6, B.id); }
  if (h > 28 && R() < 0.7) { const cx = x0 + (sx >> 1), cz = z0 + (sz >> 1); box(w, cx, h, cz, cx, h + 4 + ((R() * 4) | 0), cz, 6, B.id); }
  if (pal.sign && sx >= 6) pal.sign(w, B, x0, z0, x1, z1, h);
  return B;
}
const STYLE = {
  glass(R) { const g = R() < 0.5 ? 3 : 29; return { roof: 5, rim: 25, facade: (x, y, z, u, c, fy) => c ? 25 : fy === 0 ? 25 : g }; },
  office(R) { const wall = R() < 0.5 ? 1 : 28; return { roof: 5, rim: wall, facade: (x, y, z, u, c, fy) => c ? wall : (fy === 1 || fy === 2) && u % 3 !== 0 ? 3 : wall }; },
  brick(R) { return { roof: 31, rim: 4, facade: (x, y, z, u, c, fy) => c ? 4 : y > 0 && y < 3 && u % 4 !== 0 ? 3 : fy === 2 && u % 3 === 1 ? 3 : 4 }; },
  neon(R) {
    const n = [21, 22, 30][(R() * 3) | 0], n2 = [21, 22, 30][(R() * 3) | 0];
    return { roof: 23, rim: n, unit: 23,
      facade: (x, y, z, u, c, fy, h) => c ? n : y % 12 === 6 ? n2 : (fy === 1 || fy === 2) && u % 2 === 1 ? (hashW(x, y, z) < 0.55 ? 20 : 24) : 23,
      sign: (w, B, x0, z0, x1, z1, h) => { // 屋頂看板
        if (R() < 0.45) return; const sz = Math.min(x1 - x0 - 1, 8), sx0 = x0 + 1, zz = z0 + ((z1 - z0) >> 1), c = [21, 22, 30][(R() * 3) | 0];
        for (let y = h + 1; y <= h + 5; y++) for (let x = sx0; x < sx0 + sz; x++) { const fr = y === h + 1 || y === h + 5 || x === sx0 || x === sx0 + sz - 1; w.set(x, y, zz, fr ? c : (hashW(x, y, 7) < 0.4 ? c : 23), B.id); }
        w.set(sx0, h + 1, zz, 6, B.id);
      } };
  },
  warehouse(R) { return { roof: 31, rim: 4, facade: (x, y, z, u, c, fy) => c ? 31 : y < 5 && u % 8 >= 2 && u % 8 <= 5 ? 2 : fy === 3 && u % 4 === 1 ? 3 : 4 }; },
};
function hashW(x, y, z) { let h = (x * 73856093) ^ (y * 19349663) ^ (z * 83492791); h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

function tree(w, x, z, R) { box(w, x, 0, z, x, 2, z, 18); const s = R() < 0.5 ? 1 : 2; box(w, x - 1, 3, z - 1, x + 1, 3 + s, z + 1, 19); w.set(x, 4 + s, z, 19); }
function lamp(w, x, z, dx, dz) { box(w, x, 0, z, x, 4, z, 16); w.set(x + dx, 5, z + dz, 16); w.set(x + dx, 4, z + dz, 17); }
function car(w, x, z, alongX, m) {
  if (alongX) { box(w, x, 0, z, x + 3, 0, z + 1, m); box(w, x + 1, 1, z, x + 2, 1, z + 1, 15); w.set(x, 1, z, m); w.set(x, 1, z + 1, m); }
  else { box(w, x, 0, z, x + 1, 0, z + 3, m); box(w, x, 1, z + 1, x + 1, 1, z + 2, 15); w.set(x, 1, z, m); w.set(x + 1, 1, z, m); }
}
function sidewalkProps(w, R, night) {
  for (const c of ROADS) for (let t = 6; t < 96; t += 8) {
    if (ROADS.some((r) => Math.abs(t - r) < 5)) continue;
    if (c > 0) { lamp(w, c - 4, t, 1, 0); }
    if (c < 96) { lamp(w, t, c + 3, 0, -1); }
  }
}
function parking(w, R, x0, z0) { for (let r = 0; r < 3; r++) for (let k = 0; k < 6; k++) if (R() < 0.75) car(w, x0 + 1 + k * 2 + (k > 2 ? 1 : 0), z0 + 1 + r * 5, false, [12, 13, 14][(R() * 3) | 0]); }
function park(w, R, x0, z0) { for (let i = 0; i < 7; i++) tree(w, x0 + 2 + ((R() * 12) | 0), z0 + 2 + ((R() * 12) | 0), R); }

// 每個街廓 = [x0, z0]（16×16 的可建區）
function blocks() { const b = []; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) b.push([ROADS[i] + 4, ROADS[j] + 4, i, j]); return b; }

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
        for (let a = 0; a < 3; a++) for (let c = 0; c < 2; c++) {
          const sx = x0 + a * 6, sz = z0 + c * 9; const B = w.newBuilding(sx, sz, sx + 3, sz + 6, "container");
          const n = 1 + ((R() * 3) | 0);
          for (let k = 0; k < n; k++) { const m = [8, 9, 10, 11][(R() * 4) | 0]; box(w, sx, k * 3, sz, sx + 3, k * 3 + 2, sz + 6, m, B.id); for (let z = sz; z <= sz + 6; z += 2) w.set(sx, k * 3 + 1, z, 2, B.id); }
        }
        continue;
      }
      const t = R();
      if (t < 0.55) building(w, R, x0, z0 + 1, 16, 14, (7 + R() * 5) | 0, "warehouse");
      else if (t < 0.8) { building(w, R, x0 + 1, z0 + 1, 7, 14, (10 + R() * 14) | 0, "brick"); building(w, R, x0 + 9, z0 + 1, 7, 14, (12 + R() * 16) | 0, "office"); }
      else { parking(w, R, x0, z0); info.lots.push([x0, z0]); }
    }
    // 碼頭木棧道（x 68~71）
    // 起重機：塔柱 + 伸向海面的吊臂
    for (const cz of [10, 34, 58, 82]) {
      const B = w.newBuilding(64, cz - 2, 92, cz + 2, "crane");
      for (let y = 0; y < 26; y++) for (const [dx, dz] of [[0, 0], [3, 0], [0, 3], [3, 3]]) w.set(64 + dx, y, cz - 1 + dz, 7, B.id);
      for (let y = 0; y < 26; y += 3) { box(w, 64, y, cz - 1, 67, y, cz - 1, 7, B.id); box(w, 64, y, cz + 2, 67, y, cz + 2, 7, B.id); box(w, 64, y, cz - 1, 64, y, cz + 2, 7, B.id); box(w, 67, y, cz - 1, 67, y, cz + 2, 7, B.id); }
      box(w, 60, 26, cz, 92, 27, cz + 1, 7, B.id); box(w, 64, 28, cz, 67, 30, cz + 1, 6, B.id);
      box(w, 86, 18, cz, 86, 25, cz, 6, B.id); box(w, 85, 16, cz - 1, 87, 17, cz + 1, 8, B.id);
    }
    // 貨輪（停在水上）
    for (const [sz, c] of [[16, 31], [60, 9]]) {
      const B = w.newBuilding(76, sz, 91, sz + 22, "ship");
      for (let y = 0; y < 5; y++) for (let z = sz; z <= sz + 22; z++) for (let x = 76; x <= 91; x++) {
        const taper = z < sz + 3 ? (sz + 3 - z) : 0; if (x < 76 + taper || x > 91 - taper) continue;
        const edge = x === 76 + taper || x === 91 - taper || z === sz || z === sz + 22 || y === 0 || y === 4;
        if (edge) w.set(x, y, z, y < 2 ? 2 : c, B.id);
      }
      for (let k = 0; k < 3; k++) { const m = [8, 9, 10, 11][(R() * 4) | 0]; box(w, 78, 5, sz + 4 + k * 5, 89, 6, sz + 7 + k * 5, m, B.id); }
      box(w, 79, 5, sz + 18, 86, 11, sz + 21, 32, B.id); box(w, 80, 9, sz + 18, 85, 9, sz + 18, 3, B.id); box(w, 82, 12, sz + 19, 83, 15, sz + 20, 31, B.id);
    }
    for (let t = 6; t < 96; t += 8) { if (ROADS.some((r) => Math.abs(t - r) < 5)) continue; if (t < 66) lamp(w, t, 51, 0, -1); lamp(w, 20, t, 1, 0); }
    for (let i = 0; i < 6; i++) tree(w, 4 + ((R() * 40) | 0), 1, R);
  } else {
    for (const [x0, z0, i, j] of blocks()) {
      const center = (i === 1 || i === 2) && (j === 1 || j === 2);
      const t = R(), tall = center ? 1 : 0.7;
      if (t < 0.4) building(w, R, x0 + 1, z0 + 1, 14, 14, (24 + R() * 24 * tall) | 0, "neon");
      else if (t < 0.75) { building(w, R, x0, z0, 7, 16, (14 + R() * 28 * tall) | 0, "neon"); building(w, R, x0 + 9, z0, 7, 16, (12 + R() * 26 * tall) | 0, R() < 0.7 ? "neon" : "brick"); }
      else for (let a = 0; a < 2; a++) for (let c = 0; c < 2; c++) building(w, R, x0 + a * 9, z0 + c * 9, 7, 7, (8 + R() * 22 * tall) | 0, R() < 0.75 ? "neon" : "office");
    }
    sidewalkProps(w, R, true);
  }
  // 車道（車流用）：每條內部道路兩個方向
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
