// 體素世界：網格資料、分塊網格化（面剔除 + 頂點環境光遮蔽）、破壞與「連通性支撐」倒塌判定。
import * as THREE from "../vendor/three.module.js";

export const W = 96, D = 96, H = 56, CS = 16;
const CX = W / CS, CY = Math.ceil(H / CS), CZ = D / CS;

// 材質：c=顏色, s=分數, g=自發光, gl=玻璃, p=小物件（車／路燈／樹）
export const MAT = [];
function M(id, hex, s, o = {}) { MAT[id] = { id, hex, s, g: !!o.g, gl: !!o.gl, p: !!o.p, name: o.n || "" }; }
M(1, 0xcfcbc2, 10); M(2, 0x8f8b85, 10); M(3, 0x5d93db, 15, { gl: 1 }); M(4, 0xb5543a, 10); M(5, 0x6b6460, 8);
M(6, 0x7c8a96, 20); M(7, 0xf2b21b, 20); M(8, 0xc63c2c, 15); M(9, 0x2f6db5, 15); M(10, 0x3d9b4a, 15); M(11, 0xe8862a, 15);
M(12, 0xe0342c, 30, { p: 1, n: "car" }); M(13, 0x2b7de0, 30, { p: 1, n: "car" }); M(14, 0xf4c430, 30, { p: 1, n: "car" }); M(15, 0x22303a, 30, { p: 1, n: "car" });
M(16, 0x3a3f45, 20, { p: 1 }); M(17, 0xfff1b0, 20, { p: 1, g: 1 }); M(18, 0x6b4a2a, 5, { p: 1 }); M(19, 0x3f9a3a, 5, { p: 1 });
M(20, 0xffcf70, 15, { g: 1, gl: 1 }); M(21, 0xff3fb4, 25, { g: 1 }); M(22, 0x2ff0ff, 25, { g: 1 }); M(23, 0x34364a, 10);
M(24, 0x1d2c44, 15, { gl: 1 }); M(25, 0xeeeeea, 10); M(26, 0x8a5a32, 10); M(27, 0x4f9f45, 8); M(28, 0xd8c39a, 10);
M(29, 0x3fb6b0, 15, { gl: 1 }); M(30, 0xa36bff, 25, { g: 1 }); M(31, 0x7a2a26, 12); M(32, 0xf4f4f0, 12);
for (let i = 1; i < 256; i++) if (!MAT[i]) MAT[i] = MAT[1];
const COL = new Float32Array(256 * 3);
for (let i = 1; i < 256; i++) { const c = new THREE.Color().setHex(MAT[i].hex); COL[i * 3] = c.r; COL[i * 3 + 1] = c.g; COL[i * 3 + 2] = c.b; }
export function defineMat(id, hex, o = {}) { M(id, hex, o.s || 0, o); const c = new THREE.Color().setHex(hex); COL[id * 3] = c.r; COL[id * 3 + 1] = c.g; COL[id * 3 + 2] = c.b; }
export function matColor(m, out) { out.r = COL[m * 3]; out.g = COL[m * 3 + 1]; out.b = COL[m * 3 + 2]; return out; }
export function hash3(x, y, z) { let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

// ---- 網格化 ----
// get(x,y,z) 回傳材質 id（範圍外 0；y<0 視為地面＝實心以剔除底面）
const AO_L = [0.42, 0.62, 0.82, 1.0];
const SHADE = [0.86, 0.86, 1.0, 0.62, 0.92, 0.92]; // +x,-x,+y,-y,+z,-z 的面亮度（讓方塊有立體感）
// 預先計算每個面的四個角：頂點偏移、AO 取樣的三個鄰格偏移
const FACES = [];
for (let f = 0; f < 6; f++) {
  const a = f >> 1, s = (f & 1) ? -1 : 1, ua = (a + 1) % 3, va = (a + 2) % 3;
  const n = [0, 0, 0]; n[a] = s;
  const C = [[0, 0], [1, 0], [1, 1], [0, 1]], corners = [];
  for (const [cu, cv] of C) {
    const p = [0, 0, 0]; if (s > 0) p[a] = 1; p[ua] = cu; p[va] = cv;
    const du = cu ? 1 : -1, dv = cv ? 1 : -1;
    const s1 = n.slice(), s2 = n.slice(), cc = n.slice(); s1[ua] += du; s2[va] += dv; cc[ua] += du; cc[va] += dv;
    corners.push({ p, s1, s2, cc });
  }
  FACES.push({ n, s, corners });
}
export function meshVoxels(get, x0, y0, z0, sx, sy, sz, ox, oy, oz) {
  const out = [mk(), mk()]; // [一般, 自發光]
  function mk() { return { p: [], n: [], c: [], i: [] }; }
  const ao = [0, 0, 0, 0];
  for (let y = y0; y < y0 + sy; y++) for (let z = z0; z < z0 + sz; z++) for (let x = x0; x < x0 + sx; x++) {
    const m = get(x, y, z); if (!m) continue;
    const mt = MAT[m], gl = mt.g ? 1 : 0, o = out[gl];
    const v = 0.9 + hash3(x, y, z) * 0.16;
    const cr = COL[m * 3], cg = COL[m * 3 + 1], cb = COL[m * 3 + 2];
    for (let f = 0; f < 6; f++) {
      const F = FACES[f], nx = F.n[0], ny = F.n[1], nz = F.n[2];
      const nm = get(x + nx, y + ny, z + nz);
      if (nm && (!MAT[nm].gl || mt.gl)) continue; // 鄰格實心（玻璃後面仍畫牆）
      const base = o.p.length / 3, sh = SHADE[f] * v;
      for (let k = 0; k < 4; k++) {
        const K = F.corners[k];
        o.p.push(x + K.p[0] - ox, y + K.p[1] - oy, z + K.p[2] - oz); o.n.push(nx, ny, nz);
        let l = 3;
        if (!gl) {
          const b1 = get(x + K.s1[0], y + K.s1[1], z + K.s1[2]) ? 1 : 0, b2 = get(x + K.s2[0], y + K.s2[1], z + K.s2[2]) ? 1 : 0;
          const b3 = get(x + K.cc[0], y + K.cc[1], z + K.cc[2]) ? 1 : 0;
          l = b1 && b2 ? 0 : 3 - (b1 + b2 + b3);
        }
        ao[k] = l;
        const L = sh * AO_L[l] * (gl ? 1.25 : 1);
        o.c.push(cr * L, cg * L, cb * L);
      }
      const flip = ao[0] + ao[2] < ao[1] + ao[3];
      let t0, t1, t2, t3, t4, t5;
      if (flip) { t0 = 1; t1 = 2; t2 = 3; t3 = 1; t4 = 3; t5 = 0; } else { t0 = 0; t1 = 1; t2 = 2; t3 = 0; t4 = 2; t5 = 3; }
      if (F.s < 0) o.i.push(base + t0, base + t2, base + t1, base + t3, base + t5, base + t4);
      else o.i.push(base + t0, base + t1, base + t2, base + t3, base + t4, base + t5);
    }
  }
  return out;
}
function solid(m) { return m ? 1 : 0; }
export function toGeometry(o) {
  if (!o.i.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(o.p, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(o.n, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(o.c, 3));
  g.setIndex(o.p.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(o.i, 1) : new THREE.Uint16BufferAttribute(o.i, 1));
  g.computeBoundingSphere();
  return g;
}

export class World {
  constructor(scene, mats) {
    this.scene = scene; this.mats = mats; // { lit, glow }
    this.vox = new Uint8Array(W * H * D); this.bid = new Uint16Array(W * H * D);
    this.stamp = new Int32Array(W * H * D); this.gen = 1;
    this.chunks = []; this.dirty = new Set();
    this.buildings = [null]; this.totalB = 0; this.remainB = 0;
    this.group = new THREE.Group(); scene.add(this.group);
    this.get = (x, y, z) => (y < 0 ? 255 : (x < 0 || z < 0 || y >= H || x >= W || z >= D) ? 0 : this.vox[x + z * W + y * W * D]);
    this.shadows = false;
  }
  idx(x, y, z) { return x + z * W + y * W * D; }
  inb(x, y, z) { return x >= 0 && z >= 0 && y >= 0 && x < W && y < H && z < D; }
  at(x, y, z) { return this.inb(x, y, z) ? this.vox[this.idx(x, y, z)] : 0; }
  set(x, y, z, m, b = 0) { if (!this.inb(x, y, z)) return; const i = this.idx(x, y, z); this.vox[i] = m; this.bid[i] = m ? b : 0; }
  newBuilding(x0, z0, x1, z1, kind) { const b = { id: this.buildings.length, x0, z0, x1, z1, kind, total: 0, remain: 0, base0: 0, collapsed: false, dead: false }; this.buildings.push(b); return b; }
  finalize() {
    // 統計每棟建築的體素與底部（y<3）數量
    for (let i = 0; i < this.vox.length; i++) { const b = this.bid[i]; if (b && this.vox[i]) { const B = this.buildings[b]; B.total++; if (i < W * D * 3) B.base0++; } }
    this.totalB = 0; for (const B of this.buildings) if (B) { B.remain = B.total; this.totalB += B.total; B.bx = 0; B.bz = 0; B.bn = 0; }
    for (let i = 0; i < W * D * 3; i++) { const b = this.bid[i]; if (b && this.vox[i]) { const B = this.buildings[b], r = i % (W * D); B.bx += r % W; B.bz += (r / W) | 0; B.bn++; } }
    for (const B of this.buildings) if (B) { B.cx = B.bn ? B.bx / B.bn + 0.5 : (B.x0 + B.x1 + 1) / 2; B.cz = B.bn ? B.bz / B.bn + 0.5 : (B.z0 + B.z1 + 1) / 2; }
    this.remainB = this.totalB;
    for (let cy = 0; cy < CY; cy++) for (let cz = 0; cz < CZ; cz++) for (let cx = 0; cx < CX; cx++) { this.chunks.push({ cx, cy, cz, lit: null, glow: null }); this.dirty.add(this.chunks.length - 1); }
    this.rebuild(9999);
  }
  markDirty(x, y, z) {
    const cx = (x / CS) | 0, cy = (y / CS) | 0, cz = (z / CS) | 0;
    const add = (a, b, c) => { if (a >= 0 && b >= 0 && c >= 0 && a < CX && b < CY && c < CZ) this.dirty.add(a + c * CX + b * CX * CZ); };
    add(cx, cy, cz);
    const lx = x % CS, ly = y % CS, lz = z % CS;
    if (lx === 0) add(cx - 1, cy, cz); if (lx === CS - 1) add(cx + 1, cy, cz);
    if (ly === 0) add(cx, cy - 1, cz); if (ly === CS - 1) add(cx, cy + 1, cz);
    if (lz === 0) add(cx, cy, cz - 1); if (lz === CS - 1) add(cx, cy, cz + 1);
  }
  rebuild(max = 8) {
    let n = 0;
    for (const ci of this.dirty) {
      if (n++ >= max) break;
      this.dirty.delete(ci);
      const c = this.chunks[ci];
      const res = meshVoxels(this.get, c.cx * CS, c.cy * CS, c.cz * CS, CS, Math.min(CS, H - c.cy * CS), CS, 0, 0, 0);
      for (const [k, mat, j] of [["lit", this.mats.lit, 0], ["glow", this.mats.glow, 1]]) {
        if (c[k]) { this.group.remove(c[k]); c[k].geometry.dispose(); c[k] = null; }
        const g = toGeometry(res[j]); if (!g) continue;
        const mesh = new THREE.Mesh(g, mat); mesh.matrixAutoUpdate = false;
        if (j === 0) { mesh.castShadow = this.shadows; mesh.receiveShadow = this.shadows; }
        c[k] = mesh; this.group.add(mesh);
      }
    }
  }
  setShadows(on) { this.shadows = on; for (const c of this.chunks) if (c.lit) { c.lit.castShadow = on; c.lit.receiveShadow = on; } }
  pct() { return this.totalB ? (1 - this.remainB / this.totalB) : 0; }
  // 移除一格（不觸發倒塌判定），回傳材質
  removeAt(i, x, y, z) {
    const m = this.vox[i]; if (!m) return 0;
    const b = this.bid[i]; this.vox[i] = 0; this.bid[i] = 0;
    if (b) { const B = this.buildings[b]; B.remain--; this.remainB--; }
    this.markDirty(x, y, z); return m;
  }
  /**
   * 球形破壞。opt: filter(m)→bool、noise、debris(cb)、maxDebris、skipCollapse
   * 回傳 { n, score, glass, props, bids:Set, seeds:[] }
   */
  destroySphere(cx, cy, cz, r, opt = {}) {
    const res = { n: 0, score: 0, glass: 0, props: 0, bids: new Set(), cars: 0 };
    const x0 = Math.max(0, Math.floor(cx - r - 1)), x1 = Math.min(W - 1, Math.ceil(cx + r + 1));
    const y0 = Math.max(0, Math.floor(cy - r - 1)), y1 = Math.min(H - 1, Math.ceil(cy + r + 1));
    const z0 = Math.max(0, Math.floor(cz - r - 1)), z1 = Math.min(D - 1, Math.ceil(cz + r + 1));
    const seeds = []; const removed = [];
    const noise = opt.noise === undefined ? 0.8 : opt.noise;
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const i = x + z * W + y * W * D, m = this.vox[i]; if (!m) continue;
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, dz = z + 0.5 - cz;
      const rr = r + (hash3(x, y, z) - 0.5) * noise;
      if (dx * dx + dy * dy + dz * dz > rr * rr) continue;
      if (opt.filter && !opt.filter(m, x, y, z)) continue;
      const b = this.bid[i]; if (b) res.bids.add(b);
      this.removeAt(i, x, y, z);
      res.n++; res.score += MAT[m].s; if (MAT[m].gl) res.glass++; if (MAT[m].p) res.props++; if (MAT[m].name === "car") res.cars++;
      removed.push(x, y, z, m);
    }
    if (!res.n) return res;
    if (opt.debris) {
      const cnt = removed.length / 4, maxD = opt.maxDebris || 40, step = Math.max(1, cnt / maxD);
      for (let k = 0; k < cnt; k += step) { const j = (k | 0) * 4; opt.debris(removed[j] + 0.5, removed[j + 1] + 0.5, removed[j + 2] + 0.5, removed[j + 3]); }
    }
    // 倒塌判定的種子：被移除格子周圍的實心格
    for (let k = 0; k < removed.length; k += 4) {
      const x = removed[k], y = removed[k + 1], z = removed[k + 2];
      if (this.at(x + 1, y, z)) seeds.push(x + 1, y, z); if (this.at(x - 1, y, z)) seeds.push(x - 1, y, z);
      if (this.at(x, y + 1, z)) seeds.push(x, y + 1, z); if (this.at(x, y, z + 1)) seeds.push(x, y, z + 1);
      if (this.at(x, y, z - 1)) seeds.push(x, y, z - 1);
    }
    res.seeds = seeds;
    return res;
  }
  /** 連通性支撐：從種子做 DFS（優先往下找），碰到 y=0 就算有支撐；整群找不到地面＝懸空 → 回傳該群體素並從世界移除 */
  findFloating(seeds, limit = 40000) {
    const out = [];
    const gen = ++this.gen; const st = this.stamp, vox = this.vox;
    const stack = [];
    for (let s = 0; s < seeds.length; s += 3) {
      const sx = seeds[s], sy = seeds[s + 1], sz = seeds[s + 2];
      const si = sx + sz * W + sy * W * D;
      if (!vox[si] || st[si] === gen || st[si] === -gen) continue;
      // 新的搜尋：先標成 -gen（進行中），結束時若懸空則收集
      const comp = []; stack.length = 0; stack.push(si); st[si] = -gen; let grounded = false, overflow = false;
      while (stack.length) {
        const i = stack.pop(); comp.push(i);
        const y = (i / (W * D)) | 0;
        if (y === 0) { grounded = true; break; }
        const r = i - y * W * D, z = (r / W) | 0, x = r - z * W;
        // 推入順序：上、四周、下（下最後推 → 最先處理）
        const nb = [];
        if (y + 1 < H) nb.push(i + W * D);
        if (x + 1 < W) nb.push(i + 1); if (x > 0) nb.push(i - 1);
        if (z + 1 < D) nb.push(i + W); if (z > 0) nb.push(i - W);
        nb.push(i - W * D);
        let hitOld = false;
        for (const j of nb) {
          if (!vox[j]) continue;
          if (st[j] === gen) { hitOld = true; break; } // 碰到這一輪已確認有支撐的群 → 有支撐
          if (st[j] === -gen) continue;
          st[j] = -gen; stack.push(j);
        }
        if (hitOld) { grounded = true; break; }
        if (comp.length > limit) { overflow = true; break; }
      }
      if (grounded || overflow) {
        for (const i of comp) st[i] = gen; for (const i of stack) st[i] = gen;
      } else {
        for (const i of comp) {
          const y = (i / (W * D)) | 0, r = i - y * W * D, z = (r / W) | 0, x = r - z * W;
          out.push(x, y, z, vox[i]);
        }
        for (const i of comp) { const y = (i / (W * D)) | 0, r = i - y * W * D, z = (r / W) | 0, x = r - z * W; this.removeAt(i, x, y, z); }
      }
    }
    return out;
  }
  /** 建築底部（y<3）剩不到 40% → 整棟結構失效，回傳剩餘體素並移除 */
  checkBase(bids) {
    const res = [];
    for (const b of bids) {
      const B = this.buildings[b]; if (!B || B.collapsed || B.base0 < 6) continue;
      let cnt = 0;
      for (let y = 0; y < 3; y++) for (let z = B.z0; z <= B.z1; z++) for (let x = B.x0; x <= B.x1; x++) { const i = this.idx(x, y, z); if (this.bid[i] === b && this.vox[i]) cnt++; }
      if (cnt < B.base0 * 0.42) {
        B.collapsed = true;
        const vox = [];
        for (let y = 0; y < H; y++) for (let z = B.z0; z <= B.z1; z++) for (let x = B.x0; x <= B.x1; x++) {
          const i = this.idx(x, y, z); if (this.bid[i] === b && this.vox[i]) { vox.push(x, y, z, this.vox[i]); }
        }
        for (let k = 0; k < vox.length; k += 4) this.removeAt(this.idx(vox[k], vox[k + 1], vox[k + 2]), vox[k], vox[k + 1], vox[k + 2]);
        res.push({ b: B, vox });
      }
    }
    return res;
  }
  topSolid(x, z, below = H) {
    x = Math.floor(x); z = Math.floor(z); if (x < 0 || z < 0 || x >= W || z >= D) return 0;
    for (let y = Math.min(H, below) - 1; y >= 0; y--) if (this.vox[this.idx(x, y, z)]) return y + 1;
    return 0;
  }
  dispose() {
    for (const c of this.chunks) for (const k of ["lit", "glow"]) if (c[k]) { c[k].geometry.dispose(); }
    this.scene.remove(this.group);
  }
}
