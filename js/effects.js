// 特效：碎塊（InstancedMesh 物件池，有上限、會回收最舊的）、煙塵、衝擊波環、整群倒塌
import * as THREE from "../vendor/three.module.js";
import { matColor, meshVoxels, toGeometry, MAT } from "./world.js";

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

export class Debris {
  constructor(scene, cap, mat) {
    this.cap = cap; this.scene = scene;
    const geo = new THREE.BoxGeometry(0.82, 0.82, 0.82);
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
  spawn(x, y, z, m, vx, vy, vz, size = 1) {
    const i = this.next; this.next = (this.next + 1) % this.cap; // 滿了就回收最舊的
    if (this.life[i] <= 0) this.alive++;
    this.px[i] = x; this.py[i] = y; this.pz[i] = z; this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.rx[i] = Math.random() * 3; this.ry[i] = Math.random() * 3; this.rz[i] = 0;
    this.wx[i] = (Math.random() - 0.5) * 12; this.wy[i] = (Math.random() - 0.5) * 12; this.wz[i] = (Math.random() - 0.5) * 12;
    this.life[i] = 2.2 + Math.random() * 1.6; this.sz[i] = size * (0.7 + Math.random() * 0.45);
    matColor(m, _c); const v = 0.85 + Math.random() * 0.25; this.mesh.instanceColor.setXYZ(i, _c.r * v, _c.g * v, _c.b * v);
    this.mesh.instanceColor.needsUpdate = true;
  }
  update(dt) {
    const g = 30; let alive = 0;
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { _m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, _m); continue; }
      alive++;
      this.vy[i] -= g * dt;
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
  constructor(scene, mats, game) { this.scene = scene; this.mats = mats; this.game = game; this.list = []; this.max = 7; }
  add(vox, opt = {}) {
    const n = vox.length / 4; if (!n) return;
    const G = this.game;
    if (n < 10 || this.list.length >= this.max) { // 太小或同時太多 → 直接碎掉
      const step = Math.max(1, n / 30);
      for (let k = 0; k < n; k += step) { const j = (k | 0) * 4; G.debris.spawn(vox[j] + 0.5, vox[j + 1] + 0.5, vox[j + 2] + 0.5, vox[j + 3], (Math.random() - 0.5) * 6, Math.random() * 4, (Math.random() - 0.5) * 6); }
      return;
    }
    let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
    const map = new Map();
    for (let k = 0; k < vox.length; k += 4) { const x = vox[k], y = vox[k + 1], z = vox[k + 2]; map.set(x + "," + y + "," + z, vox[k + 3]); x0 = Math.min(x0, x); y0 = Math.min(y0, y); z0 = Math.min(z0, z); x1 = Math.max(x1, x); y1 = Math.max(y1, y); z1 = Math.max(z1, z); }
    const cx = (x0 + x1 + 1) / 2, cz = (z0 + z1 + 1) / 2;
    const res = meshVoxels((x, y, z) => map.get(x + "," + y + "," + z) || 0, x0, y0, z0, x1 - x0 + 1, y1 - y0 + 1, z1 - z0 + 1, cx, y0, cz);
    const g = new THREE.Group();
    for (const [j, mat] of [[0, this.mats.lit], [1, this.mats.glow]]) { const geo = toGeometry(res[j]); if (geo) g.add(new THREE.Mesh(geo, mat)); }
    g.position.set(cx, y0, cz); this.scene.add(g);
    // 倒向：遠離巨獸的方向
    let dx = cx - (opt.fromX ?? cx), dz = cz - (opt.fromZ ?? cz); const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const axis = new THREE.Vector3(dz, 0, -dx).normalize();
    const floor = opt.whole ? 0 : G.world.topSolid(cx, cz, y0);
    this.list.push({ g, vox, n, x0, x1, z0, z1, cx, cz, h: y1 - y0 + 1, vy: opt.whole ? -1 : 0, ang: 0, w: opt.whole ? 0.12 + Math.random() * 0.1 : (Math.random() - 0.5) * 0.6, axis,
      floor, landed: false, t: 0, emit: 0, whole: !!opt.whole, sink: 0 });
  }
  update(dt) {
    const G = this.game;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i]; f.t += dt;
      if (!f.landed) {
        f.vy -= (f.whole ? 9 : 30) * dt; f.g.position.y += f.vy * dt;
        if (f.g.position.y <= f.floor) {
          f.landed = true; f.g.position.y = f.floor;
          const big = f.n > 120;
          G.shake(big ? 0.8 : 0.4); G.sfx(big ? "erupt" : "rock");
          if (f.floor > 0) { // 砸在別的屋頂上 → 連鎖破壞，然後碎掉
            G.impact(f.cx, f.floor, f.cz, Math.min(6, 2 + Math.sqrt(f.n) * 0.25));
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
        const per = G.quality.level === 0 ? 3 : 6;
        for (let k = 0; k < per; k++) {
          const j = ((Math.random() * f.n) | 0) * 4, x = f.vox[j] + 0.5, z = f.vox[j + 2] + 0.5;
          G.debris.spawn(x + (Math.random() - 0.5), 0.6 + Math.random() * 1.5, z + (Math.random() - 0.5), f.vox[j + 3], (x - f.cx) * 0.8 + (Math.random() - 0.5) * 5, 4 + Math.random() * 7, (z - f.cz) * 0.8 + (Math.random() - 0.5) * 5);
        }
        const r = Math.max(f.x1 - f.x0, f.z1 - f.z0) / 2 + 1;
        if (Math.random() < 0.6) { const a = Math.random() * 6.283; G.dust.spawn(f.cx + Math.cos(a) * r, 1 + Math.random() * 2, f.cz + Math.sin(a) * r, 1.8 + Math.min(1.6, f.n / 600), Math.cos(a) * 4, 1.6, Math.sin(a) * 4, 2.2); }
      }
      if (f.sink > f.h + 2 || f.t > 9) { this.remove(i); G.onFallDone(f); }
    }
  }
  shatter(f) {
    const G = this.game, step = Math.max(1, f.n / (G.quality.level === 0 ? 30 : 60));
    for (let k = 0; k < f.n; k += step) { const j = (k | 0) * 4; G.debris.spawn(f.vox[j] + 0.5, f.floor + (f.vox[j + 1] - f.vox[1]) * 0.3 + 1, f.vox[j + 2] + 0.5, f.vox[j + 3], (Math.random() - 0.5) * 10, 3 + Math.random() * 8, (Math.random() - 0.5) * 10); }
    G.dust.spawn(f.cx, f.floor + 1, f.cz, 3 + Math.min(4, f.n / 200));
  }
  remove(i) { const f = this.list[i]; this.scene.remove(f.g); f.g.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); this.list.splice(i, 1); }
  clear() { while (this.list.length) this.remove(0); }
}
