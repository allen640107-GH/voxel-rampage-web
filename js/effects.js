// 特效：碎塊（InstancedMesh 物件池，有上限、會回收最舊的；大中小混合）、細粉塵、煙塵、衝擊波環、整群倒塌（分段塌落）
import * as THREE from "../vendor/three.module.js";
import { matColor, meshVoxels, toGeometry, MAT, RES, RES2 } from "./world.js";

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

export class Debris {
  constructor(scene, cap, mat, opt = {}) {
    this.cap = cap; this.scene = scene; this.fine = !!opt.fine; // fine = 細碎粉屑（壽命短、偏亮）
    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.frustumCulled = false;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.mesh.castShadow = false;
    const F = () => new Float32Array(cap);
    this.px = F(); this.py = F(); this.pz = F(); this.vx = F(); this.vy = F(); this.vz = F();
    this.rx = F(); this.ry = F(); this.rz = F(); this.wx = F(); this.wy = F(); this.wz = F(); this.life = F(); this.sz = F();
    this.next = 0; this.alive = 0;
    _m.makeScale(0, 0, 0); for (let i = 0; i < cap; i++) this.mesh.setMatrixAt(i, _m);
    scene.add(this.mesh);
  }
  // size 省略 → 隨機大中小混合（公尺）：55% 碎粒 0.2–0.35、33% 碎片 0.4–0.6、12% 大塊 0.75–1.05
  spawn(x, y, z, m, vx, vy, vz, size) {
    if (size === undefined) { const r = Math.random(); size = this.fine ? 0.1 + Math.random() * 0.12 : r < 0.55 ? 0.2 + Math.random() * 0.15 : r < 0.88 ? 0.4 + Math.random() * 0.2 : 0.75 + Math.random() * 0.3; }
    const i = this.next; this.next = (this.next + 1) % this.cap; // 滿了就回收最舊的
    if (this.life[i] <= 0) this.alive++;
    this.px[i] = x; this.py[i] = y; this.pz[i] = z; this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.rx[i] = Math.random() * 3; this.ry[i] = Math.random() * 3; this.rz[i] = 0;
    this.wx[i] = (Math.random() - 0.5) * 12; this.wy[i] = (Math.random() - 0.5) * 12; this.wz[i] = (Math.random() - 0.5) * 12;
    this.life[i] = this.fine ? 0.7 + Math.random() * 0.8 : (2.2 + Math.random() * 1.6) * (size < 0.4 ? 0.75 : 1); this.sz[i] = size;
    matColor(m, _c); const v = 0.85 + Math.random() * 0.25, wh = this.fine ? 0.35 : 0; // 粉屑混一點灰白
    this.mesh.instanceColor.setXYZ(i, (_c.r * (1 - wh) + 0.8 * wh) * v, (_c.g * (1 - wh) + 0.78 * wh) * v, (_c.b * (1 - wh) + 0.74 * wh) * v);
    this.mesh.instanceColor.needsUpdate = true;
  }
  update(dt) {
    const g = 30; let alive = 0;
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { _m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, _m); continue; }
      alive++;
      this.vy[i] -= g * dt * (this.fine ? 0.45 : 1);
      if (this.fine) { this.vx[i] *= 0.96; this.vz[i] *= 0.96; }
      this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt;
      const s = this.sz[i] * Math.min(1, this.life[i] / 0.6);
      if (this.py[i] < s * 0.4) { this.py[i] = s * 0.4; if (this.vy[i] < -2) { this.vy[i] *= -0.32; this.vx[i] *= 0.6; this.vz[i] *= 0.6; this.wx[i] *= 0.5; this.wz[i] *= 0.5; } else { this.vy[i] = 0; this.vx[i] *= 0.9; this.vz[i] *= 0.9; this.wx[i] *= 0.9; this.wy[i] *= 0.9; this.wz[i] *= 0.9; } }
      this.rx[i] += this.wx[i] * dt; this.ry[i] += this.wy[i] * dt; this.rz[i] += this.wz[i] * dt;
      _e.set(this.rx[i], this.ry[i], this.rz[i]); _q.setFromEuler(_e); _p.set(this.px[i], this.py[i], this.pz[i]); _s.set(s, s, s);
      _m.compose(_p, _q, _s); this.mesh.setMatrixAt(i, _m);
    }
    this.alive = alive;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  clear() { _m.makeScale(0, 0, 0); for (let i = 0; i < this.cap; i++) { this.life[i] = 0; this.mesh.setMatrixAt(i, _m); } this.mesh.instanceMatrix.needsUpdate = true; this.alive = 0; }
  dispose() { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.dispose(); }
}

export class Dust {
  constructor(scene, cap, color) {
    this.cap = cap; this.scene = scene;
    const geo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
    this.mat = new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.3, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, cap); this.mesh.frustumCulled = false; this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.p = new Float32Array(cap * 3); this.v = new Float32Array(cap * 3); this.life = new Float32Array(cap); this.max = new Float32Array(cap); this.sz = new Float32Array(cap);
    this.next = 0; _m.makeScale(0, 0, 0); for (let i = 0; i < cap; i++) this.mesh.setMatrixAt(i, _m);
    scene.add(this.mesh);
  }
  spawn(x, y, z, size = 2, vx = 0, vy = 1.5, vz = 0, life = 1.6) {
    const i = this.next; this.next = (this.next + 1) % this.cap;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z; this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.life[i] = this.max[i] = life * (0.8 + Math.random() * 0.4); this.sz[i] = size * (0.7 + Math.random() * 0.6);
  }
  update(dt) {
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { _m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, _m); continue; }
      const k = 1 - this.life[i] / this.max[i];
      this.p[i * 3] += this.v[i * 3] * dt; this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt; this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      this.v[i * 3] *= 0.97; this.v[i * 3 + 2] *= 0.97;
      const s = this.sz[i] * 0.75 * (0.5 + k * 1.2) * (k > 0.7 ? (1 - k) / 0.3 : 1);
      _p.set(this.p[i * 3], this.p[i * 3 + 1], this.p[i * 3 + 2]); _e.set(i * 0.7, i * 1.3 + k, 0); _q.setFromEuler(_e); _s.set(s, s, s); _m.compose(_p, _q, _s); this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  clear() { _m.makeScale(0, 0, 0); for (let i = 0; i < this.cap; i++) { this.life[i] = 0; this.mesh.setMatrixAt(i, _m); } this.mesh.instanceMatrix.needsUpdate = true; }
  dispose() { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mat.dispose(); this.mesh.dispose(); }
}

export class Rings {
  constructor(scene) {
    this.scene = scene; this.list = [];
    this.geo = new THREE.RingGeometry(0.86, 1, 48); this.geo.rotateX(-Math.PI / 2);
  }
  spawn(x, z, R, color = 0xffffff, dur = 0.6, y = 0.3) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(this.geo, mat); m.position.set(x, y, z); m.scale.setScalar(0.5); this.scene.add(m);
    this.list.push({ m, t: 0, dur, R });
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const r = this.list[i]; r.t += dt; const k = r.t / r.dur;
      if (k >= 1) { this.scene.remove(r.m); r.m.material.dispose(); this.list.splice(i, 1); continue; }
      r.m.scale.setScalar(0.5 + (r.R - 0.5) * (1 - (1 - k) * (1 - k))); r.m.material.opacity = 0.9 * (1 - k);
    }
  }
  clear() { for (const r of this.list) { this.scene.remove(r.m); r.m.material.dispose(); } this.list = []; }
}

// 懸空或失去支撐的一整群體素：先自由落下，碰到地面（或屋頂）後一邊下沉一邊崩成碎塊與煙塵
export class Falling {
  constructor(scene, mats, game) { this.scene = scene; this.mats = mats; this.game = game; this.list = []; this.max = 9; }
  // vox：體素座標 [x,y,z,m,...]（0.5 公尺一格）。整棟倒塌時依高度切成幾段，上段晚一點、各自歪向不同角度 → 像一層層塌下來
  add(vox, opt = {}) {
    const n = vox.length / 4; if (!n) return;
    if (opt.whole && !opt.part && n > 400 * RES2) {
      let y0 = 1e9, y1 = -1e9; for (let k = 1; k < vox.length; k += 4) { y0 = Math.min(y0, vox[k]); y1 = Math.max(y1, vox[k]); }
      const segs = Math.min(3, 1 + Math.floor((y1 - y0) / (14 * RES))), hh = (y1 - y0 + 1) / segs, parts = Array.from({ length: segs }, () => []);
      for (let k = 0; k < vox.length; k += 4) { const s = Math.min(segs - 1, Math.floor((vox[k + 1] - y0) / hh)); parts[s].push(vox[k], vox[k + 1], vox[k + 2], vox[k + 3]); }
      parts.forEach((p, s) => this.add(p, { ...opt, part: true, delay: s * 0.22, tilt: s }));
      return;
    }
    const G = this.game;
    if (n < 10 * RES2 || this.list.length >= this.max) { // 太小或同時太多 → 直接碎掉
      const step = Math.max(1, n / 36);
      for (let k = 0; k < n; k += step) { const j = (k | 0) * 4; G.debris.spawn((vox[j] + 0.5) / RES, (vox[j + 1] + 0.5) / RES, (vox[j + 2] + 0.5) / RES, vox[j + 3], (Math.random() - 0.5) * 6, Math.random() * 4, (Math.random() - 0.5) * 6); }
      if (G.grit) for (let k = 0; k < Math.min(24, n / 4); k++) { const j = ((Math.random() * n) | 0) * 4; G.grit.spawn((vox[j] + 0.5) / RES, (vox[j + 1] + 0.5) / RES, (vox[j + 2] + 0.5) / RES, vox[j + 3], (Math.random() - 0.5) * 5, Math.random() * 3, (Math.random() - 0.5) * 5); }
      return;
    }
    let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
    for (let k = 0; k < vox.length; k += 4) { const x = vox[k], y = vox[k + 1], z = vox[k + 2]; x0 = Math.min(x0, x); y0 = Math.min(y0, y); z0 = Math.min(z0, z); x1 = Math.max(x1, x); y1 = Math.max(y1, y); z1 = Math.max(z1, z); }
    const sx = x1 - x0 + 1, sy = y1 - y0 + 1, sz = z1 - z0 + 1, grid = new Uint8Array(sx * sy * sz);
    for (let k = 0; k < vox.length; k += 4) grid[(vox[k] - x0) + (vox[k + 2] - z0) * sx + (vox[k + 1] - y0) * sx * sz] = vox[k + 3];
    const get = (x, y, z) => { x -= x0; y -= y0; z -= z0; return x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz ? 0 : grid[x + z * sx + y * sx * sz]; };
    const vcx = (x0 + x1 + 1) / 2, vcz = (z0 + z1 + 1) / 2;
    const res = meshVoxels(get, x0, y0, z0, sx, sy, sz, vcx, y0, vcz);
    const g = new THREE.Group();
    for (const [j, mat] of [[0, this.mats.lit], [1, this.mats.glow]]) { const geo = toGeometry(res[j]); if (geo) { const ms = new THREE.Mesh(geo, mat); ms.scale.setScalar(1 / RES); g.add(ms); } }
    const cx = vcx / RES, cz = vcz / RES, by = y0 / RES;
    g.position.set(cx, by, cz); g.visible = true; this.scene.add(g);
    // 倒向：遠離巨獸的方向（分段時每段再偏一點）
    let dx = cx - (opt.fromX ?? cx), dz = cz - (opt.fromZ ?? cz); const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const tw = (opt.tilt || 0) * 0.5 * (Math.random() < 0.5 ? -1 : 1), ca = Math.cos(tw), sa = Math.sin(tw); [dx, dz] = [dx * ca - dz * sa, dx * sa + dz * ca];
    const axis = new THREE.Vector3(dz, 0, -dx).normalize();
    const floor = opt.whole ? 0 : G.world.topSolid(cx, cz, by);
    this.list.push({ g, vox, n, neq: n / RES2, x0: x0 / RES, x1: (x1 + 1) / RES, z0: z0 / RES, z1: (z1 + 1) / RES, cx, cz, by, h: sy / RES, vy: opt.whole ? -1 : 0, ang: 0,
      w: opt.whole ? 0.12 + Math.random() * 0.1 + (opt.tilt || 0) * 0.08 : (Math.random() - 0.5) * 0.6, axis, delay: opt.delay || 0,
      floor, landed: false, t: 0, emit: 0, whole: !!opt.whole, sink: 0 });
  }
  update(dt) {
    const G = this.game;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i];
      if (f.delay > 0) { f.delay -= dt; continue; }
      f.t += dt;
      if (!f.landed) {
        f.vy -= (f.whole ? 9 : 30) * dt; f.g.position.y += f.vy * dt;
        if (f.g.position.y <= f.floor) {
          f.landed = true; f.g.position.y = f.floor;
          const big = f.neq > 120;
          G.shake(big ? 0.8 : 0.4); G.sfx(big ? "erupt" : "rock");
          if (f.floor > 0) { // 砸在別的屋頂上 → 連鎖破壞，然後碎掉
            G.impact(f.cx, f.floor, f.cz, Math.min(6, 2 + Math.sqrt(f.neq) * 0.25));
            this.shatter(f); this.remove(i); continue;
          }
        }
      } else {
        f.sink += dt * (f.whole ? 5 + f.t * 3 : 10); f.g.position.y = f.floor - f.sink;
        if (f.whole) f.w += dt * 0.35;
      }
      f.ang = Math.min(f.whole ? 0.45 : 0.9, f.ang + f.w * dt);
      f.g.quaternion.setFromAxisAngle(f.axis, f.ang);
      f.emit -= dt;
      if ((f.landed || f.whole) && f.emit <= 0) {
        f.emit = 0.07;
        const per = G.quality.level === 0 ? 3 : 6, gy = Math.max(0.4, f.g.position.y + 0.4);
        for (let k = 0; k < per; k++) {
          const j = ((Math.random() * f.n) | 0) * 4, x = (f.vox[j] + 0.5) / RES, z = (f.vox[j + 2] + 0.5) / RES;
          G.debris.spawn(x + (Math.random() - 0.5), gy + Math.random() * 1.5, z + (Math.random() - 0.5), f.vox[j + 3], (x - f.cx) * 0.8 + (Math.random() - 0.5) * 5, 4 + Math.random() * 7, (z - f.cz) * 0.8 + (Math.random() - 0.5) * 5);
          if (G.grit) G.grit.spawn(x + (Math.random() - 0.5) * 2, gy + Math.random(), z + (Math.random() - 0.5) * 2, f.vox[j + 3], (x - f.cx) * 0.5 + (Math.random() - 0.5) * 4, 2 + Math.random() * 4, (z - f.cz) * 0.5 + (Math.random() - 0.5) * 4);
        }
        const r = Math.max(f.x1 - f.x0, f.z1 - f.z0) / 2 + 1;
        if (Math.random() < 0.6) { const a = Math.random() * 6.283; G.dust.spawn(f.cx + Math.cos(a) * r, 1 + Math.random() * 2, f.cz + Math.sin(a) * r, 1.8 + Math.min(1.6, f.neq / 600), Math.cos(a) * 4, 1.6, Math.sin(a) * 4, 2.2); }
      }
      if (f.sink > f.h + 2 || f.t > 9) { this.remove(i); G.onFallDone(f); }
    }
  }
  shatter(f) {
    const G = this.game, step = Math.max(1, f.n / (G.quality.level === 0 ? 36 : 72));
    for (let k = 0; k < f.n; k += step) { const j = (k | 0) * 4; G.debris.spawn((f.vox[j] + 0.5) / RES, f.floor + (f.vox[j + 1] / RES - f.by) * 0.3 + 1, (f.vox[j + 2] + 0.5) / RES, f.vox[j + 3], (Math.random() - 0.5) * 10, 3 + Math.random() * 8, (Math.random() - 0.5) * 10); }
    if (G.grit) for (let k = 0; k < 20; k++) G.grit.spawn(f.cx + (Math.random() - 0.5) * 3, f.floor + 1, f.cz + (Math.random() - 0.5) * 3, f.vox[3], (Math.random() - 0.5) * 9, 2 + Math.random() * 5, (Math.random() - 0.5) * 9);
    G.dust.spawn(f.cx, f.floor + 1, f.cz, 3 + Math.min(4, f.neq / 200));
  }
  remove(i) { const f = this.list[i]; this.scene.remove(f.g); f.g.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); this.list.splice(i, 1); }
  clear() { while (this.list.length) this.remove(0); }
}
