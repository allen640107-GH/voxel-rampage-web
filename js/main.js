// 方塊巨獸大暴走 Voxel Rampage — 主程式
import * as THREE from "../vendor/three.module.js";
import { World, W, D, H, MAT, RES2 } from "./world.js";
import { SCENES, SCENE_ORDER, generate, paintGround, rng } from "./city.js";
import { MONSTERS, MONSTER_ORDER, buildMonster } from "./monster.js";
import { Debris, Dust, Rings, Falling } from "./effects.js";
import { loadSave, writeSave, SAVE_VERSION } from "./save.js";

export const VERSION = "1.1.0";
const AUDIO = window.AUDIO;
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const TEST = params.has("test");

// ---------------- 存檔 ----------------
const loaded = loadSave();
const save = loaded.save;
function persist() { writeSave(save); }
function applyAudio() { AUDIO.set({ muted: save.settings.muted, music: save.settings.music, sfx: save.settings.sfx }); }
applyAudio();

// ---------------- 裝置與畫質 ----------------
const isTouch = matchMedia("(pointer:coarse)").matches || "ontouchstart" in window || navigator.maxTouchPoints > 0;
if (isTouch) document.body.classList.add("touch");
function detectQuality() {
  const mem = navigator.deviceMemory || 4, cores = navigator.hardwareConcurrency || 4;
  if (mem <= 3 || cores <= 4) return 0;
  return isTouch ? 1 : 2;
}
const QL = [
  { pr: 1, shadows: false, debris: 300, grit: 120, dust: 50, traffic: 8, perHit: 20, aa: false },
  { pr: 1.5, shadows: false, debris: 560, grit: 220, dust: 90, traffic: 12, perHit: 40, aa: true },
  { pr: 2, shadows: true, debris: 900, grit: 360, dust: 140, traffic: 16, perHit: 68, aa: true },
];
const quality = { level: save.settings.quality === "auto" ? detectQuality() : +save.settings.quality, auto: save.settings.quality === "auto", drops: 0 };

// ---------------- 渲染器 ----------------
const canvas = $("cv");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: QL[quality.level].aa, powerPreference: "high-performance" });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.type = THREE.PCFShadowMap;
const camera = new THREE.PerspectiveCamera(55, 1, 0.5, 600);
function applyQuality() {
  const q = QL[quality.level];
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pr));
  renderer.shadowMap.enabled = q.shadows;
  if (G.world) G.world.setShadows(q.shadows);
  if (G.sun) G.sun.castShadow = q.shadows;
  if (G.mon && G.mon.g.userData.lod !== quality.level) rebuildMonster();
  resize();
}
function rebuildMonster() { // 畫質改變 → 換成對應 LOD 的模型
  const m = G.mon, old = m.g, g = buildMonster(m.def.id, mats, { quality: quality.level });
  old.parent.add(g); old.removeFromParent(); old.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  m.g = g; m.nodes = g.userData.nodes;
}
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w / h < 0.8 ? 70 : w / h < 1.2 ? 62 : 55;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
window.addEventListener("orientationchange", () => setTimeout(resize, 200));
if (window.visualViewport) window.visualViewport.addEventListener("resize", resize);

const mats = {
  lit: new THREE.MeshLambertMaterial({ vertexColors: true }),
  glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
  mon: new THREE.MeshLambertMaterial({ vertexColors: true }),
  monGlow: new THREE.MeshBasicMaterial({ vertexColors: true }),
  debris: new THREE.MeshLambertMaterial({ color: 0xffffff }),
};
// 透視挖洞：相機與巨獸之間擋住視線的方塊會被「挖空」一個圓錐，永遠看得到巨獸
const seeThru = { uMon: { value: new THREE.Vector3() }, uCam: { value: new THREE.Vector3() }, uRad: { value: 7 } };
for (const mt of [mats.lit, mats.glow]) {
  mt.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, seeThru);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vWPos;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vWPos; uniform vec3 uMon; uniform vec3 uCam; uniform float uRad;")
      .replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>
      { vec3 cm = uMon - uCam; float L = length(cm); vec3 dr = cm / max(L, 0.001); vec3 cf = vWPos - uCam; float t = dot(cf, dr);
        if (t > 0.0 && t < L - 3.0) { float d = length(cf - dr * t); float rad = uRad * (0.35 + 0.65 * t / L);
          if (d < rad) { if (d > rad - 1.2) { if (mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0) < 1.0) discard; } else discard; } } }`);
  };
}

// ---------------- 遊戲狀態 ----------------
const G = {
  screen: "loading", scene: null, world: null, monster: null, mon: null, info: null, S: null, sun: null,
  playing: false, paused: false, over: false, time: 90, score: 0, combo: 0, comboT: 0, mult: 1,
  collapsed: 0, cars: 0, shakeA: 0, quality, yaw: Math.PI, pitch: 0.62, camDragT: 0, autopilot: false, frames: 0, fps: 60,
  input: { x: 0, y: 0 }, keys: {}, monId: save.monster || "trex", sceneId: save.scene || "downtown",
};
window.__vr = { G, save: () => save, loaded, VERSION, SAVE_VERSION, quality: () => quality.level };

function show(id) {
  for (const s of ["loading", "intro", "menu", "select", "settings", "credits"]) $(s).classList.toggle("hidden", s !== id);
  $("hud").classList.toggle("hidden", id !== "game");
  G.screen = id;
}
function sfx(n, o) { AUDIO.play(n, o); }

// ---------------- 場景建立 ----------------
function skyTexture(cols) {
  const c = document.createElement("canvas"); c.width = 4; c.height = 256; const g = c.getContext("2d");
  const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, cols[0]); gr.addColorStop(0.55, cols[1]); gr.addColorStop(1, cols[2]);
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function disposeScene() {
  if (!G.scene) return;
  G.world && G.world.dispose(); G.debris && G.debris.dispose(); G.grit && G.grit.dispose(); G.dust && G.dust.dispose(); G.rings && G.rings.clear(); G.falling && G.falling.clear();
  G.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material !== mats.lit && o.material !== mats.glow && o.material !== mats.mon && o.material !== mats.monGlow && o.material !== mats.debris) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
  if (G.scene.background && G.scene.background.dispose) G.scene.background.dispose();
  G.scene = null; G.world = null;
}
function buildScene(sceneId, monId) {
  disposeScene();
  const S = SCENES[sceneId], q = QL[quality.level];
  const scene = new THREE.Scene(); G.scene = scene; G.S = S;
  scene.background = skyTexture(S.sky);
  scene.fog = new THREE.Fog(S.fog, S.fogNear, S.fogFar);
  scene.add(new THREE.HemisphereLight(S.hemi[0], S.hemi[1], S.hemi[2]));
  const sun = new THREE.DirectionalLight(S.sun, S.sunI); G.sun = sun;
  sun.castShadow = q.shadows; sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -48; sc.right = 48; sc.top = 48; sc.bottom = -48; sc.near = 1; sc.far = 220; sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.6;
  scene.add(sun); scene.add(sun.target);
  // 世界
  const world = new World(scene, mats); G.world = world; world.shadows = q.shadows;
  const info = generate(world, sceneId); G.info = info;
  world.finalize();
  // 地面
  const gtex = new THREE.CanvasTexture(paintGround(sceneId, info)); gtex.colorSpace = THREE.SRGBColorSpace; gtex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshLambertMaterial({ map: gtex }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(W / 2, 0, D / 2); ground.receiveShadow = q.shadows; scene.add(ground);
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshLambertMaterial({ color: S.ground }));
  outer.rotation.x = -Math.PI / 2; outer.position.set(W / 2, -0.05, D / 2); scene.add(outer);
  if (info.water) {
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(420, 900), new THREE.MeshLambertMaterial({ color: 0x23608e }));
    sea.rotation.x = -Math.PI / 2; sea.position.set(info.water + 210, -0.03, D / 2); scene.add(sea);
  }
  // 遠景天際線（不可破壞，只是背景）
  const R = rng(S.seed + 7), N = 90;
  const sky = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: S.sky2 }), N);
  const m4 = new THREE.Matrix4(); let k = 0;
  for (let i = 0; i < N; i++) {
    const a = R() * Math.PI * 2, r = 80 + R() * 70, x = W / 2 + Math.cos(a) * r, z = D / 2 + Math.sin(a) * r;
    if (info.water && x > info.water + 10) continue;
    const h = 12 + R() * (S.night ? 70 : 55), w = 6 + R() * 10;
    m4.makeScale(w, h, w); m4.setPosition(x, h / 2, z); sky.setMatrixAt(k++, m4);
  }
  sky.count = k; scene.add(sky);
  if (S.night) { // 夜城遠景窗光
    const lights = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xff7ad0 }), 160); let j = 0;
    for (let i = 0; i < 160; i++) { const a = R() * Math.PI * 2, r = 84 + R() * 60; m4.makeScale(1.2, 0.8, 1.2); m4.setPosition(W / 2 + Math.cos(a) * r, 4 + R() * 50, D / 2 + Math.sin(a) * r); lights.setMatrixAt(j++, m4); }
    scene.add(lights);
  }
  // 特效
  G.debris = new Debris(scene, q.debris, mats.debris);
  G.grit = new Debris(scene, q.grit, mats.debris, { fine: true }); // 細粉屑
  G.dust = new Dust(scene, q.dust, S.night ? 0x6a5a80 : 0xc9bfae);
  G.rings = new Rings(scene);
  G.falling = new Falling(scene, mats, game);
  // 巨獸
  const def = MONSTERS[monId];
  const mg = buildMonster(monId, mats, { quality: quality.level }); scene.add(mg);
  G.mon = { def, g: mg, nodes: mg.userData.nodes, x: info.spawn[0], z: info.spawn[1], h: Math.PI * 0.75, vx: 0, vz: 0, ph: 0, t: 0, cd: [0, 0, 0, 0], anim: null, events: [], moving: 0, crushT: 0, stuck: 0 };
  const blob = new THREE.Mesh(new THREE.CircleGeometry(def.bodyR * 1.5, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.06; scene.add(blob); G.mon.blob = blob;
  // 車流
  G.traffic = []; G.carMats = [0xe0342c, 0x2b7de0, 0xf4c430, 0xf0f0f0, 0x2a2a2a, 0x3aa85a].map((c) => new THREE.MeshLambertMaterial({ color: c }));
  G.carDark = new THREE.MeshLambertMaterial({ color: 0x1b2430 }); G.carLight = new THREE.MeshBasicMaterial({ color: 0xfff1b0 });
  G.carGeo = [new THREE.BoxGeometry(1.7, 1.0, 3.6), new THREE.BoxGeometry(1.5, 0.8, 1.9), new THREE.BoxGeometry(0.4, 0.3, 0.1)];
  for (let i = 0; i < q.traffic; i++) spawnCar(true);
  G.yaw = G.mon.h + Math.PI; G.pitch = 0.72; G.camPitch = undefined; G.camDist = undefined;
}
function spawnCar(initial) {
  const info = G.info, R = Math.random;
  for (let tries = 0; tries < 10; tries++) {
    const lane = info.lanes[(R() * info.lanes.length) | 0]; const t = 2 + R() * (lane.max - 4);
    const x = lane.ax === "x" ? t : lane.c, z = lane.ax === "x" ? lane.c : t;
    if (G.mon && Math.hypot(x - G.mon.x, z - G.mon.z) < (initial ? 14 : 28)) continue;
    const g = new THREE.Group(), ci = (R() * G.carMats.length) | 0;
    const body = new THREE.Mesh(G.carGeo[0], G.carMats[ci]); body.position.y = 0.6; g.add(body);
    const cab = new THREE.Mesh(G.carGeo[1], G.carDark); cab.position.set(0, 1.45, -0.2); g.add(cab);
    for (const s of [-0.55, 0.55]) { const l = new THREE.Mesh(G.carGeo[2], G.carLight); l.position.set(s, 0.7, 1.81); g.add(l); }
    G.scene.add(g);
    const car = { g, lane, t, speed: 5 + R() * 4, col: [12, 13, 14, 32, 15, 10][ci], dead: false };
    placeCar(car); G.traffic.push(car); return;
  }
}
function placeCar(c) {
  const L = c.lane;
  if (L.ax === "x") { c.g.position.set(c.t, 0, L.c); c.g.rotation.y = L.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
  else { c.g.position.set(L.c, 0, c.t); c.g.rotation.y = L.dir > 0 ? 0 : Math.PI; }
}
function explodeCar(c) {
  if (c.dead) return; c.dead = true; G.scene.remove(c.g);
  const p = c.g.position;
  for (let i = 0; i < 16; i++) G.debris.spawn(p.x + (Math.random() - 0.5) * 2, 0.8 + Math.random(), p.z + (Math.random() - 0.5) * 2, i % 3 === 0 ? 15 : i % 4 === 0 ? 11 : c.col, (Math.random() - 0.5) * 14, 8 + Math.random() * 10, (Math.random() - 0.5) * 14, 0.8);
  G.dust.spawn(p.x, 1.5, p.z, 2.4, 0, 3, 0, 1.4); G.dust.spawn(p.x, 2.5, p.z, 2, 0, 4, 0, 1.6);
  G.rings.spawn(p.x, p.z, 6, 0xff9a2a, 0.45);
  addScore(200, p.x, 2, p.z, "汽車 +"); G.cars++; save.totals.cars++;
  sfx("boom", { vol: 0.8 }); shake(0.3);
  setTimeout(() => { if (G.playing && G.traffic.includes(c)) { G.traffic.splice(G.traffic.indexOf(c), 1); spawnCar(false); } }, 3500);
}

// ---------------- 破壞與分數 ----------------
const game = {
  get debris() { return G.debris; }, get grit() { return G.grit; }, get dust() { return G.dust; }, get world() { return G.world; }, quality,
  shake: (a) => shake(a), sfx: (n) => sfx(n), impact: (x, y, z, r) => hit(x, y + 0.5, z, r, { chain: true }),
  onFallDone: () => {},
};
function shake(a) { if (save.settings.shake) G.shakeA = Math.min(1.6, G.shakeA + a); }
function hit(x, y, z, r, opt = {}) {
  const world = G.world, q = QL[quality.level], m = G.mon;
  const res = world.destroySphere(x, y, z, r, {
    filter: opt.filter, noise: opt.noise, maxDebris: opt.maxDebris || q.perHit,
    debris: (px, py, pz, mat) => {
      let dx = px - x, dy = py - y, dz = pz - z; const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
      const sp = 6 + Math.random() * 10, push = opt.push || 0;
      G.debris.spawn(px, py, pz, mat, dx * sp + (opt.dirX || 0) * push + (Math.random() - 0.5) * 3, Math.max(dy, 0.2) * sp + 4 + Math.random() * 6, dz * sp + (opt.dirZ || 0) * push + (Math.random() - 0.5) * 3);
      if (Math.random() < 0.6) G.grit.spawn(px, py, pz, mat, dx * sp * 0.6 + (Math.random() - 0.5) * 5, Math.max(dy, 0.2) * sp * 0.5 + 2 + Math.random() * 4, dz * sp * 0.6 + (Math.random() - 0.5) * 5);
    },
  });
  // 打到車流
  for (const c of G.traffic) if (!c.dead && Math.hypot(c.g.position.x - x, c.g.position.z - z) < r + 1.5 && y - r < 3) explodeCar(c);
  if (!res.n) return res;
  let pts = res.score;
  // 連通性：懸空的整群掉下來
  const fl = world.findFloating(res.seeds || []);
  if (fl.length) { let s = 0; for (let k = 3; k < fl.length; k += 4) s += MAT[fl[k]].s; pts += s * 0.5; G.falling.add(fl, { fromX: m.x, fromZ: m.z }); if (fl.length / 4 / RES2 > 60) sfx("rock"); }
  // 底部被打掉 → 整棟倒塌
  const cols = world.checkBase(res.bids);
  for (const c of cols) {
    let s = 0; for (let k = 3; k < c.vox.length; k += 4) s += MAT[c.vox[k]].s; pts += s * 0.5 + 500;
    G.falling.add(c.vox, { whole: true, fromX: m.x, fromZ: m.z }); G.collapsed++;
    banner(c.b.kind === "crane" ? "起重機倒了！" : c.b.kind === "ship" ? "貨輪沉沒！" : "大樓倒塌！");
    sfx("erupt"); sfx("boom"); shake(1.0);
  }
  if (res.eq >= 3) { G.combo++; G.comboT = 2.2; }
  addScore(pts, x, y + 2, z);
  if (res.glass > 4) sfx("shatter", { vol: 0.7 }); else if (res.eq > 2) sfx(Math.random() < 0.5 ? "rock" : "hit", { vol: 0.8 });
  for (let i = 0; i < Math.min(4, 1 + res.eq / 30); i++) G.dust.spawn(x + (Math.random() - 0.5) * r, Math.max(1, y), z + (Math.random() - 0.5) * r, 1.6 + r * 0.3);
  save.totals.voxels += Math.round(res.eq);
  return res;
}
function multOf(combo) { return 1 + Math.min(4, Math.floor(combo / 10) * 0.5); }
let popI = 0; const pops = [];
for (let i = 0; i < 6; i++) { const s = document.createElement("span"); s.style.display = "none"; $("pops").appendChild(s); pops.push({ el: s, t: 0, p: new THREE.Vector3() }); }
function addScore(base, x, y, z, label = "+") {
  G.mult = multOf(G.combo);
  const pts = Math.round(base * G.mult); if (!pts) return;
  G.score += pts;
  if (pts < 300 && label === "+") return; // 小分數不跳字，避免畫面擠滿數字
  const P = pops[popI++ % pops.length]; P.t = 1; P.p.set(x, y, z); P.dx = (Math.random() - 0.5) * 60; P.el.textContent = label + pts; P.el.style.display = "block";
  P.el.style.color = pts >= 1000 ? "#ffd25e" : "#ffffff";
}
let bannerT = 0;
function banner(txt) { const b = $("hBanner"); b.textContent = txt; b.classList.remove("hidden"); b.style.animation = "none"; void b.offsetWidth; b.style.animation = ""; bannerT = 1.6; }

// ---------------- 巨獸：移動、攻擊、動畫 ----------------
function blockedAt(x, z, r) {
  const w = G.world;
  for (let a = 0; a < 12; a++) {
    const px = Math.floor(x + Math.cos(a * 0.5236) * r), pz = Math.floor(z + Math.sin(a * 0.5236) * r);
    for (let y = 1; y <= 4; y++) { const m = w.at(px, y, pz); if (m && !MAT[m].p) return true; }
  }
  return false;
}
function fwd(m) { return [Math.sin(m.h), Math.cos(m.h)]; }
function attack(k, fromBuffer) {
  const m = G.mon; if (!G.playing || G.paused || !m) return false;
  if (m.cd[k] > 0 || (m.anim && m.anim.k !== 2 && m.anim.t < m.anim.dur * 0.6)) { if (!fromBuffer && m.cd[k] < 0.35) G.buf = { k, t: 0.4 }; return false; } // 動作中按下 → 先記住，0.4 秒內自動出招
  G.buf = null;
  const d = m.def; m.cd[k] = d.cd[k];
  const [fx, fz] = fwd(m);
  if (k === 0) { // 踩踏
    m.anim = { k, t: 0, dur: 0.45 }; sfx("sk_stomp", { vol: 0.6 });
    m.events.push({ t: 0.22, fn: () => {
      const [fx, fz] = fwd(m), cx = m.x + fx * d.stomp.fwd, cz = m.z + fz * d.stomp.fwd;
      hit(cx, d.stomp.r * 0.35, cz, d.stomp.r, { push: 4, dirX: fx, dirZ: fz });
      hit(cx, 1, cz, d.stomp.r * 1.8, { filter: (mm) => MAT[mm].p });
      G.rings.spawn(cx, cz, d.stomp.r * 2.4, 0xfff0c0, 0.5); sfx("boom", { vol: 0.7 }); shake(0.55);
      for (let i = 0; i < 6; i++) { const a = i * 1.047; G.dust.spawn(cx + Math.cos(a) * 2, 0.8, cz + Math.sin(a) * 2, 1.8, Math.cos(a) * 7, 1, Math.sin(a) * 7, 1.2); }
    } });
  } else if (k === 1) { // 甩尾（巨猿：橫掃）
    const front = d.id === "ape"; m.anim = { k, t: 0, dur: 0.6, spin: true }; sfx("sk_gust");
    for (let i = 1; i <= 8; i++) m.events.push({ t: 0.6 * i / 8, fn: () => {
      const a = m.h + (front ? 0 : Math.PI) + (i / 8) * Math.PI * 2;
      for (const f of [1, 0.55]) hit(m.x + Math.sin(a) * d.tail.dist * f, d.tail.y, m.z + Math.cos(a) * d.tail.dist * f, d.tail.r * (f < 1 ? 0.8 : 1), { push: 10, dirX: Math.sin(a + 1.57), dirZ: Math.cos(a + 1.57), maxDebris: QL[quality.level].perHit * 0.6 });
      if (i === 4) shake(0.3);
    } });
  } else if (k === 2) { // 衝撞
    m.anim = { k, t: 0, dur: d.charge.dur }; sfx("sk_charge"); sfx("roar3", { vol: 0.8 });
    for (let t = 0.05; t < d.charge.dur; t += 0.08) m.events.push({ t, fn: () => {
      const [fx, fz] = fwd(m);
      hit(m.x + fx * d.charge.fwd, d.charge.y, m.z + fz * d.charge.fwd, d.charge.r, { push: 14, dirX: fx, dirZ: fz, maxDebris: QL[quality.level].perHit * 0.6 });
      hit(m.x + fx * (d.charge.fwd - 1), 1.5, m.z + fz * (d.charge.fwd - 1), d.charge.r * 0.85, { push: 10, dirX: fx, dirZ: fz, maxDebris: QL[quality.level].perHit * 0.4 });
      shake(0.12);
    } });
  } else { // 吼叫衝擊波
    m.anim = { k, t: 0, dur: 1.0 }; sfx(d.roarSfx, { vol: 1 });
    m.events.push({ t: 0.3, fn: () => {
      const R = d.roar.R, [fx, fz] = fwd(m);
      G.rings.spawn(m.x, m.z, R, 0xc890ff, 0.8, 1); G.rings.spawn(m.x, m.z, R * 0.7, 0xffffff, 0.6, 3);
      hit(m.x, 8, m.z, R, { filter: (mm, x, y, z) => (MAT[mm].gl && Math.random() < 0.5) || MAT[mm].p, noise: 2, maxDebris: QL[quality.level].perHit });
      hit(m.x + fx * 6, 6, m.z + fz * 6, d.roar.r, { push: 12, dirX: fx, dirZ: fz });
      for (const c of G.traffic) if (!c.dead && Math.hypot(c.g.position.x - m.x, c.g.position.z - m.z) < R) explodeCar(c);
      sfx("wave", { vol: 0.8 }); shake(1.1);
    } });
  }
  return true;
}
function updateMonster(dt) {
  const m = G.mon, d = m.def, w = G.world;
  m.t += dt;
  for (let k = 0; k < 4; k++) m.cd[k] = Math.max(0, m.cd[k] - dt);
  // 輸入 → 世界方向
  let ix = G.input.x, iy = G.input.y;
  if (G.keys.left) ix -= 1; if (G.keys.right) ix += 1; if (G.keys.up) iy += 1; if (G.keys.down) iy -= 1;
  let mx, mz;
  if (G.autopilot && G.apMove) { [mx, mz] = G.apMove; }
  else {
    const l = Math.hypot(ix, iy); if (l > 1) { ix /= l; iy /= l; }
    const s = Math.sin(G.yaw), c = Math.cos(G.yaw);
    mx = -s * iy + c * ix; mz = -c * iy - s * ix;
  }
  const amt = Math.min(1, Math.hypot(mx, mz));
  const charging = m.anim && m.anim.k === 2;
  if (amt > 0.08 && !(m.anim && m.anim.spin)) {
    const th = Math.atan2(mx, mz); let dh = th - m.h; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
    m.h += Math.max(-1, Math.min(1, dh)) * Math.min(1, dt * (charging ? 2.5 : 7));
  }
  let sp = d.speed * amt * (Math.abs(angleDiff(Math.atan2(mx, mz), m.h)) < 1.2 ? 1 : 0.35);
  if (m.anim && (m.anim.k === 0 || m.anim.k === 3)) sp *= 0.3;
  const [fx, fz] = fwd(m);
  let vx = fx * sp, vz = fz * sp;
  if (charging) { vx = fx * d.speed * d.charge.mult; vz = fz * d.speed * d.charge.mult; }
  const nx = Math.max(3, Math.min(W - 3, m.x + vx * dt)), nz = Math.max(3, Math.min(D - 3, m.z + vz * dt));
  const ox = m.x, oz = m.z;
  if (charging || !blockedAt(nx, nz, d.bodyR)) { m.x = nx; m.z = nz; }
  else if (!blockedAt(nx, m.z, d.bodyR)) m.x = nx;
  else if (!blockedAt(m.x, nz, d.bodyR)) m.z = nz;
  const moved = Math.hypot(m.x - ox, m.z - oz);
  m.moving = moved / Math.max(dt, 1e-4);
  m.stuck = sp > 1 && moved < sp * dt * 0.3 ? m.stuck + dt : 0;
  // 走路順便壓扁小東西（車、路燈、樹）
  m.crushT -= dt;
  if (m.moving > 1 && m.crushT <= 0) { m.crushT = 0.12; hit(m.x + fx * 1.5, 1.2, m.z + fz * 1.5, d.bodyR + 0.6, { filter: (mm) => MAT[mm].p, maxDebris: 10 }); }
  for (const c of G.traffic) if (!c.dead && Math.hypot(c.g.position.x - m.x, c.g.position.z - m.z) < d.bodyR + 1.2) explodeCar(c);
  if (G.buf) { G.buf.t -= dt; if (G.buf.t <= 0) G.buf = null; else attack(G.buf.k, true); }
  // 攻擊事件
  if (m.anim) { m.anim.t += dt; if (m.anim.t >= m.anim.dur) m.anim = null; }
  for (let i = m.events.length - 1; i >= 0; i--) { const e = m.events[i]; e.t -= dt; if (e.t <= 0) { m.events.splice(i, 1); e.fn(); } }
  // 腳步聲與震動
  const prevPh = m.ph; m.ph += m.moving * dt * 0.9 / Math.max(0.6, d.stride || 1);
  if (Math.floor(prevPh / Math.PI) !== Math.floor(m.ph / Math.PI) && m.moving > 2) { sfx("rock", { vol: 0.35, rate: 0.6 }); shake(0.06); }
  animateMonster(dt);
}
function angleDiff(a, b) { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }
function animateMonster(dt) {
  const m = G.mon, N = m.nodes, id = m.def.id, a = m.anim, t = m.t;
  let mv = Math.min(1, m.moving / m.def.speed), s = Math.sin(m.ph), c = Math.cos(m.ph);
  const p = a ? Math.min(1, a.t / a.dur) : 0, bump = a ? Math.sin(p * Math.PI) : 0;
  if (a && a.k === 2) { s = Math.sin(t * 18); c = Math.cos(t * 18); mv = 1; } // 衝撞：快步
  const idle = 1 - mv, br = Math.sin(t * 2.1);
  for (const k in N) { const o = N[k]; o.rotation.set(0, 0, 0); o.position.copy(o.userData.base); o.scale.set(1, 1, 1); }
  const R = (n, x = 0, y = 0, z = 0) => { const o = N[n]; if (o) { o.rotation.x += x; o.rotation.y += y; o.rotation.z += z; } };
  // 眨眼
  m.blink = (m.blink ?? 2) - dt; if (m.blink < -0.13) m.blink = 1.6 + Math.random() * 3.4;
  if (N.eyes && m.blink < 0) N.eyes.scale.y = 0.12;
  // 呼吸、身體起伏
  const B = N.body;
  B.position.y += -Math.abs(s) * 0.22 * mv + br * 0.07 * idle;
  B.scale.set(1 + br * 0.012 * idle, 1 + br * 0.016 * idle, 1);
  R("body", (id === "ape" ? 0.1 : 0.05) * mv, s * 0.06 * mv, s * 0.05 * mv);
  // 頭：待機時左右張望、走路時隨步伐點頭
  R("head", Math.sin(t * 1.1) * 0.05 * idle + Math.sin(m.ph * 2) * 0.05 * mv, Math.sin(t * 0.43) * 0.3 * idle + Math.sin(t * 1.9) * 0.04, Math.sin(t * 0.7) * 0.05 * idle - s * 0.04 * mv);
  R("jaw", 0.05 + Math.max(0, Math.sin(t * 0.8)) * 0.1 * idle);
  // 尾巴：由根部往尾端傳遞的波動
  for (let i = 1; i <= 4; i++) R("tail" + i, 0.03 * Math.sin(t * 1.3 - i * 0.5), Math.sin(t * 1.7 - i * 0.6) * (0.06 + 0.03 * i) * (0.6 + 0.4 * idle) + s * 0.07 * i * mv / 2);
  // 步態
  if (id === "trex" || id === "ape") {
    const th = id === "ape" ? "leg" : "thigh", amp = id === "ape" ? 0.45 : 0.55;
    for (const [S, sg] of [["L", 1], ["R", -1]]) {
      const tq = sg * s * amp * mv, kn = Math.max(0, -sg * c) * 0.85 * mv;
      R(th + S, tq - 0.03 * br * idle); R("shin" + S, kn + 0.05 * br * idle); R("foot" + S, -(tq + kn) * 0.85);
    }
  }
  if (id === "trex") { R("armL", 0.25 + Math.sin(t * 2.3) * 0.12, 0, 0.08); R("armR", 0.25 + Math.sin(t * 2.3 + 1) * 0.12, 0, -0.08); }
  if (id === "ape") {
    for (const [S, sg] of [["L", 1], ["R", -1]]) { R("arm" + S, -sg * s * 0.5 * mv, 0, sg * (0.04 + br * 0.03 * idle)); R("fore" + S, -Math.max(0, sg * c) * 0.35 * mv); }
  }
  if (id === "ankylo") { R("legFL", s * 0.45 * mv); R("legBR", s * 0.45 * mv); R("legFR", -s * 0.45 * mv); R("legBL", -s * 0.45 * mv); }
  // 攻擊
  let lift = 0, spin = 0;
  if (a) {
    if (a.k === 0) { // 踩踏：蓄力 → 重擊 → 壓扁回彈
      const up = p < 0.4 ? Math.sin((p / 0.4) * Math.PI / 2) : p < 0.5 ? 1 - (p - 0.4) / 0.1 : 0, sq = p > 0.49 && p < 0.85 ? Math.sin(((p - 0.49) / 0.36) * Math.PI) : 0;
      B.scale.y *= 1 - 0.06 * sq; B.scale.x *= 1 + 0.03 * sq;
      if (id === "ape") { R("armL", -2.6 * up + 0.3 * sq); R("armR", -2.6 * up + 0.3 * sq); R("foreL", -0.6 * up); R("foreR", -0.6 * up); R("body", -0.25 * up + 0.35 * sq); lift = up * 0.6; R("jaw", 0.45 * up); }
      else if (id === "ankylo") { R("body", -0.22 * up + 0.06 * sq); R("legFL", -0.6 * up); R("legFR", -0.6 * up); R("head", 0.2 * sq); lift = up * 1.2; }
      else { R("thighL", -0.9 * up); R("shinL", 0.9 * up); R("body", -0.1 * up + 0.1 * sq); R("head", 0.2 * sq); R("jaw", 0.3 * up); lift = up; }
    } else if (a.k === 1) { // 甩尾／橫掃：尾巴延遲跟上
      spin = (1 - Math.pow(1 - p, 2)) * Math.PI * 2;
      for (let i = 1; i <= 4; i++) R("tail" + i, 0, -(0.25 + 0.12 * i) * bump);
      R("body", 0, 0, 0.08 * bump);
      if (id === "ape") { R("armL", -1.5 * bump, 0, 0.9 * bump); R("armR", -1.5 * bump, 0, -0.9 * bump); R("foreL", -0.3 * bump); R("foreR", -0.3 * bump); }
    } else if (a.k === 2) { // 衝撞：前傾、低頭
      R("body", id === "ape" ? 0.35 : 0.2); R("head", id === "ankylo" ? 0.35 : 0.25);
      if (id === "ape") { R("armL", -1.2); R("armR", -1.2); }
      if (id === "trex") R("jaw", 0.35);
    } else if (a.k === 3) { // 吼叫：仰頭張嘴、全身顫動
      const e = p < 0.25 ? p / 0.25 : p < 0.8 ? 1 : (1 - p) / 0.2, sh = Math.sin(t * 40) * 0.03 * e;
      R("head", -0.55 * e, sh); R("jaw", 0.75 * e); R("body", -0.12 * e, 0, sh);
      for (let i = 1; i <= 4; i++) R("tail" + i, -0.12 * e);
      if (id === "ape") { R("armL", -1.3 + Math.sin(t * 22) * 0.45, 0, -0.5); R("armR", -1.3 - Math.sin(t * 22) * 0.45, 0, 0.5); R("foreL", -1.1); R("foreR", -1.1); }
      if (id === "trex") { R("armL", -0.4 * e + sh * 8); R("armR", -0.4 * e - sh * 8); }
    }
  }
  m.g.position.set(m.x, lift, m.z); m.g.rotation.y = m.h + spin;
  m.blob.position.x = m.x; m.blob.position.z = m.z;
}

// ---------------- 自動駕駛（測試與示範） ----------------
function autopilot(dt) {
  const m = G.mon, w = G.world, now = G.time;
  G.apBan = G.apBan || new Map();
  if (G.apTarget && G.score > (G.apScore || 0)) { G.apScore = G.score; G.apProg = now; }
  if (G.apTarget && G.apProg - now > 5) { G.apBan.set(G.apTarget.id, now - 12); G.apTarget = null; } // 5 秒沒進展 → 換目標
  if (!G.apTarget || G.apTarget.collapsed || G.apTarget.remain < G.apTarget.total * 0.25) {
    let best = null, bd = 1e9;
    for (const B of w.buildings) {
      if (!B || B.collapsed || B.remain < Math.max(20, B.total * 0.25)) continue;
      if (G.apBan.has(B.id) && G.apBan.get(B.id) < now) continue;
      const dd = Math.hypot(B.cx - m.x, B.cz - m.z) - Math.sqrt(B.remain) * 0.15; if (dd < bd) { bd = dd; best = B; }
    }
    G.apTarget = best; G.apProg = now; G.apScore = G.score;
  }
  const B = G.apTarget; if (!B) { G.apMove = [0, 0]; return; }
  const cx = Math.max(3, Math.min(W - 3, B.cx)), cz = Math.max(3, Math.min(D - 3, B.cz));
  const dx = cx - m.x, dz = cz - m.z, dist = Math.hypot(dx, dz), half = Math.max(B.x1 - B.x0, B.z1 - B.z0) / 2;
  G.apMove = dist > 1.5 ? [dx / dist, dz / dist] : [0, 0];
  const near = dist < Math.min(half, 8) + m.def.bodyR + 5;
  if (near || m.stuck > 0.3) {
    if (Math.abs(angleDiff(Math.atan2(dx, dz), m.h)) < 0.5) { attack(2) || attack(0); }
    attack(1); if (Math.random() < 0.02) attack(3);
  }
}
// ---------------- 相機 ----------------
const camT = new THREE.Vector3();
function updateCamera(dt) {
  const m = G.mon; if (!m) return;
  G.camDragT -= dt;
  if (G.camDragT <= 0 && m.moving > 2 && !(m.anim && m.anim.spin) && !G.autopilot) { // 慢慢轉到巨獸背後
    const want = m.h + Math.PI; G.yaw += angleDiff(want, G.yaw) * Math.min(1, dt * 0.9);
  }
  if (G.autopilot) G.yaw += angleDiff(m.h + Math.PI, G.yaw) * Math.min(1, dt * 1.5);
  if (G.keys.camL) G.yaw += dt * 2; if (G.keys.camR) G.yaw -= dt * 2;
  const portrait = camera.aspect < 0.8;
  const dist = (m.def.id === "ankylo" ? 32 : 29) * (portrait ? 1.25 : 1);
  camT.set(m.x, 6, m.z);
  // 視線被大樓擋住時稍微抬高視角（其餘交給透視挖洞）
  let pitch = G.pitch;
  for (let tries = 0; tries < 3; tries++) {
    if (camRay(m.x, 6, m.z, Math.sin(G.yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(G.yaw) * Math.cos(pitch), dist) >= dist || pitch >= 0.95) break;
    pitch = Math.min(0.95, pitch + 0.12);
  }
  G.camPitch = G.camPitch === undefined ? pitch : G.camPitch + (pitch - G.camPitch) * Math.min(1, dt * 2);
  G.camDist = dist;
  const cp = Math.cos(G.camPitch), sp = Math.sin(G.camPitch);
  let px = m.x + Math.sin(G.yaw) * cp * G.camDist, py = 6 + sp * G.camDist, pz = m.z + Math.cos(G.yaw) * cp * G.camDist;
  const k = Math.min(1, dt * 6);
  camera.position.x += (px - camera.position.x) * k; camera.position.y += (py - camera.position.y) * k; camera.position.z += (pz - camera.position.z) * k;
  if (G.shakeA > 0) { const a = G.shakeA * 0.6; camera.position.x += (Math.random() - 0.5) * a; camera.position.y += (Math.random() - 0.5) * a; camera.position.z += (Math.random() - 0.5) * a; G.shakeA = Math.max(0, G.shakeA - dt * 2.2); }
  camera.lookAt(camT);
  seeThru.uMon.value.set(m.x, 5, m.z); seeThru.uCam.value.copy(camera.position); seeThru.uRad.value = m.def.id === "ankylo" ? 9 : 7.5;
  if (G.camOv) { const o = G.camOv; camera.position.set(o[0], o[1], o[2]); camera.lookAt(o[3], o[4], o[5]); seeThru.uRad.value = 0; } // 測試截圖用固定鏡頭
  if (G.sun) { const d = G.S.sunDir; G.sun.position.set(m.x + d[0] * 60, d[1] * 60, m.z + d[2] * 60); G.sun.target.position.set(m.x, 0, m.z); }
}

function camRay(x, y, z, dx, dy, dz, max) {
  const w = G.world;
  for (let t = 3; t < max; t += 0.6) { const m = w.at(Math.floor(x + dx * t), Math.floor(y + dy * t), Math.floor(z + dz * t)); if (m && !MAT[m].p) return t; }
  return max;
}
// ---------------- HUD ----------------
function fmtTime(t) { t = Math.max(0, Math.ceil(t)); return Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0"); }
const atkBtns = [...document.querySelectorAll(".ab")];
const tmpV = new THREE.Vector3();
function updateHud(dt) {
  const S = G.S, pct = G.world.pct();
  $("hScore").textContent = G.score.toLocaleString();
  $("hTime").textContent = fmtTime(G.time); $("hTime").parentElement.classList.toggle("warn", G.time <= 10);
  $("hPct").style.width = Math.min(100, pct / S.stars[2] * 100 * 0.92) + "%";
  $("hPctTxt").textContent = Math.floor(pct * 100) + "%";
  const stars = document.querySelectorAll(".pbar .star");
  S.stars.forEach((th, i) => { stars[i].style.left = Math.min(100, th / S.stars[2] * 92) + "%"; stars[i].classList.toggle("on", pct >= th); });
  const c = $("hCombo");
  if (G.combo >= 3) { c.classList.remove("hidden"); c.textContent = `連擊 ${G.combo}　×${multOf(G.combo).toFixed(1)}`; } else c.classList.add("hidden");
  const m = G.mon;
  atkBtns.forEach((b, k) => { const p = m.cd[k] / m.def.cd[k]; b.querySelector(".cdv").style.setProperty("--p", (p * 100).toFixed(1) + "%"); b.classList.toggle("cool", p > 0); });
  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) $("hBanner").classList.add("hidden"); }
  const w = innerWidth, h = innerHeight;
  for (const P of pops) {
    if (P.t <= 0) continue; P.t -= dt * 0.8;
    if (P.t <= 0 || bannerT > 0) { P.el.style.display = "none"; if (bannerT > 0) P.t = 0; continue; } // 大字橫幅出現時不跳分數，避免重疊
    tmpV.copy(P.p); tmpV.y += (1 - P.t) * 4; tmpV.project(camera);
    if (tmpV.z > 1) { P.el.style.display = "none"; continue; }
    P.el.style.display = "block"; P.el.style.left = ((tmpV.x + 1) / 2 * w + (P.dx || 0)) + "px"; P.el.style.top = ((1 - tmpV.y) / 2 * h) + "px"; P.el.style.opacity = Math.min(1, P.t * 2);
  }
}

// ---------------- 遊戲流程 ----------------
function startGame(monId, sceneId) {
  G.monId = monId; G.sceneId = sceneId; save.monster = monId; save.scene = sceneId; persist();
  $("loadTxt").textContent = "生成城市中…"; $("loadBar").style.width = "100%"; show("loading");
  setTimeout(() => {
    buildScene(sceneId, monId);
    const S = SCENES[sceneId];
    Object.assign(G, { playing: true, paused: false, over: false, time: S.time, score: 0, combo: 0, comboT: 0, mult: 1, collapsed: 0, cars: 0, shakeA: 0, apTarget: null, startAt: performance.now() });
    atkBtns.forEach((b, k) => { b.querySelector("b").textContent = MONSTERS[monId].labels[k]; });
    show("game"); $("pause").classList.add("hidden"); $("result").classList.add("hidden");
    camera.position.set(G.mon.x + Math.sin(G.yaw) * 30, 30, G.mon.z + Math.cos(G.yaw) * 30);
    AUDIO.music(S.music); banner("開始暴走！"); sfx(MONSTERS[monId].roarSfx);
    save.totals.games++; persist();
    lastT = performance.now();
  }, 40);
}
function endGame(reason) {
  if (G.over) return; G.over = true; G.playing = false;
  const S = G.S, pct = G.world.pct(), stars = S.stars.filter((t) => pct >= t).length;
  const prev = save.best[S.id] || { score: 0, stars: 0, pct: 0 };
  const rec = G.score > prev.score;
  save.best[S.id] = { score: Math.max(prev.score, G.score), stars: Math.max(prev.stars, stars), pct: Math.max(prev.pct || 0, pct), monster: rec ? G.monId : prev.monster };
  let unlockMsg = "";
  if (stars >= 1) { const i = SCENE_ORDER.indexOf(S.id), nx = SCENE_ORDER[i + 1]; if (nx && !save.unlocked[nx]) { save.unlocked[nx] = true; unlockMsg = `解鎖新城市：${SCENES[nx].name}！`; } }
  persist();
  $("rTitle").textContent = stars >= 1 ? (reason === "all" ? "城市全毀！" : "破壞完成！") : "時間到！";
  $("rStars").innerHTML = [0, 1, 2].map((i) => `<span class="${i < stars ? "on" : "off"}">★</span>`).join("");
  $("rPct").textContent = Math.floor(pct * 100) + "%"; $("rScore").textContent = G.score.toLocaleString(); $("rBest").textContent = save.best[S.id].score.toLocaleString();
  $("rStat").textContent = `${G.collapsed}／${G.cars}`;
  $("rMsg").textContent = (rec ? "新紀錄！ " : "") + (unlockMsg || (stars < 1 ? `破壞率達到 ${Math.round(S.stars[0] * 100)}% 就能過關` : ""));
  const nx = SCENE_ORDER[SCENE_ORDER.indexOf(S.id) + 1];
  $("rNext").classList.toggle("hidden", !(nx && save.unlocked[nx]));
  $("result").classList.remove("hidden");
  AUDIO.music(stars >= 1 ? "win" : "lose"); if (stars >= 1) sfx("achieve");
  G.result = { stars, pct, score: G.score, reason };
}
function setPaused(p) {
  if (!G.playing) return; G.paused = p; $("pause").classList.toggle("hidden", !p);
  $("pMute").textContent = "聲音：" + (save.settings.muted ? "關" : "開");
  AUDIO.pauseMusic(p);
}

// ---------------- 主迴圈 ----------------
let lastT = performance.now(), fpsAcc = 0, fpsN = 0, fpsWin = 0, lowFor = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - lastT) / 1000; lastT = now; if (!(dt > 0)) dt = 0.016;
  const rdt = dt; dt = Math.min(dt, 0.05);
  if (G.screen !== "game" || !G.scene) return;
  if (G.playing && !G.paused) {
    G.time -= dt;
    G.comboT -= dt; if (G.comboT <= 0 && G.combo) { G.combo = 0; }
    if (G.autopilot) autopilot(dt);
    updateMonster(dt);
    for (const c of G.traffic) {
      if (c.dead) continue;
      const near = Math.hypot(c.g.position.x - G.mon.x, c.g.position.z - G.mon.z) < 16;
      c.t += c.speed * (near ? 1.8 : 1) * c.lane.dir * dt;
      if (c.t > c.lane.max) c.t = 1; if (c.t < 1) c.t = c.lane.max;
      placeCar(c);
    }
    if (G.time <= 0) endGame("time");
    else if (G.world.pct() >= 0.92) endGame("all");
  }
  if (!G.paused) {
    G.falling.update(dt); G.debris.update(dt); G.grit.update(dt); G.dust.update(dt); G.rings.update(dt);
    G.world.rebuild(G.playing ? 6 : 12, G.playing ? 7 : 14);
  }
  updateCamera(dt);
  updateHud(dt);
  renderer.render(G.scene, camera);
  // 效能監測：自動降畫質
  G.frames++; fpsAcc += rdt; fpsN++;
  if (fpsAcc >= 2) {
    G.fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
    if (quality.auto && G.playing && !G.paused && !document.hidden) {
      lowFor = G.fps < 36 ? lowFor + 1 : 0;
      if (lowFor >= 2 && quality.level > 0 && quality.drops < 2) { quality.level--; quality.drops++; lowFor = 0; applyQuality(); }
    }
  }
}
requestAnimationFrame(frame);

// ---------------- 輸入 ----------------
const KEYMAP = { KeyW: "up", ArrowUp: "up", KeyS: "down", ArrowDown: "down", KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right", KeyQ: "camL", KeyE: "camR" };
const ATKKEY = { KeyJ: 0, KeyK: 1, KeyL: 2, Space: 3, KeyU: 3 };
window.addEventListener("keydown", (e) => {
  if (G.screen !== "game") return;
  if (e.code === "Escape" || e.code === "KeyP") { setPaused(!G.paused); return; }
  if (KEYMAP[e.code]) { G.keys[KEYMAP[e.code]] = true; e.preventDefault(); }
  if (ATKKEY[e.code] !== undefined) { attack(ATKKEY[e.code]); e.preventDefault(); }
});
window.addEventListener("keyup", (e) => { if (KEYMAP[e.code]) G.keys[KEYMAP[e.code]] = false; });
window.addEventListener("blur", () => { G.keys = {}; G.input.x = G.input.y = 0; });
// 虛擬搖桿（左半邊任意處按下即生效）
const joy = $("joy"), base = joy.querySelector(".joyBase"), knob = joy.querySelector(".joyKnob");
let joyId = null, joyC = [0, 0];
joy.addEventListener("pointerdown", (e) => {
  if (joyId !== null) return; joyId = e.pointerId; joy.setPointerCapture(e.pointerId);
  const r = base.getBoundingClientRect(); joyC = [r.left + r.width / 2, r.top + r.height / 2];
  const jr = joy.getBoundingClientRect();
  if (Math.hypot(e.clientX - joyC[0], e.clientY - joyC[1]) > r.width * 0.7) { // 浮動搖桿：移到手指處
    base.style.left = (e.clientX - jr.left - r.width / 2) + "px"; base.style.top = (e.clientY - jr.top - r.height / 2) + "px"; base.style.bottom = "auto";
    joyC = [e.clientX, e.clientY];
  }
  joyMove(e);
});
function joyMove(e) {
  if (e.pointerId !== joyId) return;
  const R = base.getBoundingClientRect().width / 2;
  let dx = e.clientX - joyC[0], dy = e.clientY - joyC[1]; const l = Math.hypot(dx, dy);
  if (l > R) { dx *= R / l; dy *= R / l; }
  knob.style.transform = `translate(${dx}px,${dy}px)`;
  G.input.x = dx / R; G.input.y = -dy / R;
}
function joyEnd(e) { if (e.pointerId !== joyId) return; joyId = null; G.input.x = G.input.y = 0; knob.style.transform = ""; base.style.left = ""; base.style.top = ""; base.style.bottom = ""; }
joy.addEventListener("pointermove", joyMove); joy.addEventListener("pointerup", joyEnd); joy.addEventListener("pointercancel", joyEnd);
// 攻擊鍵（按住會連續觸發）
const held = new Map();
for (const b of atkBtns) {
  const k = +b.dataset.k;
  b.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); b.classList.add("down"); attack(k); held.set(e.pointerId, k); try { b.setPointerCapture(e.pointerId); } catch (er) { /* */ } });
  const up = (e) => { b.classList.remove("down"); held.delete(e.pointerId); };
  b.addEventListener("pointerup", up); b.addEventListener("pointercancel", up);
  b.addEventListener("contextmenu", (e) => e.preventDefault());
}
setInterval(() => { for (const k of held.values()) attack(k); }, 120);
// 拖曳轉視角（畫布上，非搖桿與按鈕）
let dragId = null, dragP = [0, 0];
canvas.addEventListener("pointerdown", (e) => { if (G.screen !== "game") return; dragId = e.pointerId; dragP = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener("pointermove", (e) => {
  if (e.pointerId !== dragId) return;
  const dx = e.clientX - dragP[0], dy = e.clientY - dragP[1]; dragP = [e.clientX, e.clientY];
  G.yaw -= dx * 0.008; G.pitch = Math.max(0.3, Math.min(1.3, G.pitch + dy * 0.005)); G.camDragT = 2.5;
});
const dragEnd = (e) => { if (e.pointerId === dragId) dragId = null; };
canvas.addEventListener("pointerup", dragEnd); canvas.addEventListener("pointercancel", dragEnd);
document.addEventListener("contextmenu", (e) => { if (G.screen === "game") e.preventDefault(); });
document.addEventListener("visibilitychange", () => { if (document.hidden && G.playing && !G.paused) setPaused(true); });

// ---------------- 介面 ----------------
function btn(id, fn) { $(id).addEventListener("click", (e) => { AUDIO.unlock(); fn(e); }); }
let selMon = G.monId, selScene = save.unlocked[G.sceneId] ? G.sceneId : "downtown";
function renderSelect() {
  $("monCards").innerHTML = MONSTER_ORDER.map((id) => {
    const d = MONSTERS[id];
    const st = Object.entries(d.stats).map(([k, v]) => `${k} <i>${"■".repeat(v)}${"□".repeat(5 - v)}</i>`).join("<br>");
    return `<button class="card${id === selMon ? " sel" : ""}" data-mon="${id}"><img src="${d.img}" alt=""><div><div class="nm">${d.name}</div><div class="ds">${d.desc}</div><div class="st">${st}</div></div></button>`;
  }).join("");
  $("sceneCards").innerHTML = SCENE_ORDER.map((id, i) => {
    const s = SCENES[id], b = save.best[id], un = save.unlocked[id];
    const best = b ? `最高 ${b.score.toLocaleString()}　${"★".repeat(b.stars)}${"☆".repeat(3 - b.stars)}` : "尚未挑戰";
    return `<button class="card scene${id === selScene ? " sel" : ""}" data-scene="${id}"><img src="${s.img}" alt=""><div><div class="nm">${i + 1}. ${s.name}</div><div class="ds">${s.sub}</div><div class="st">${best}</div></div>${un ? "" : `<div class="lock">🔒 先在「${SCENES[SCENE_ORDER[i - 1]].name}」<br>拿到 1 顆星解鎖</div>`}</button>`;
  }).join("");
  for (const c of document.querySelectorAll("[data-mon]")) c.onclick = () => { AUDIO.unlock(); selMon = c.dataset.mon; sfx("click"); renderSelect(); };
  for (const c of document.querySelectorAll("[data-scene]")) c.onclick = () => { AUDIO.unlock(); if (!save.unlocked[c.dataset.scene]) { sfx("deny"); return; } selScene = c.dataset.scene; sfx("click"); renderSelect(); };
}
btn("mStart", () => { sfx("click"); renderSelect(); show("select"); });
btn("sBack", () => { sfx("back"); show("menu"); });
btn("sGo", () => { sfx("click"); startGame(selMon, selScene); });
btn("hPause", () => { sfx("click"); setPaused(true); });
btn("pResume", () => { sfx("click"); setPaused(false); });
btn("pRestart", () => { sfx("click"); startGame(G.monId, G.sceneId); });
btn("pMute", () => { save.settings.muted = !save.settings.muted; persist(); applyAudio(); $("pMute").textContent = "聲音：" + (save.settings.muted ? "關" : "開"); });
btn("pQuit", () => { sfx("back"); G.playing = false; $("pause").classList.add("hidden"); toMenu(); });
btn("rAgain", () => { sfx("click"); startGame(G.monId, G.sceneId); });
btn("rNext", () => { sfx("click"); const nx = SCENE_ORDER[SCENE_ORDER.indexOf(G.sceneId) + 1]; selScene = nx; startGame(G.monId, nx); });
btn("rSel", () => { sfx("click"); $("result").classList.add("hidden"); selScene = G.sceneId; renderSelect(); show("select"); AUDIO.music("menu"); });
function toMenu() { $("result").classList.add("hidden"); show("menu"); AUDIO.music("menu"); }
// 設定
function renderSettings() {
  $("stMusic").value = save.settings.music; $("stSfx").value = save.settings.sfx; $("stQ").value = save.settings.quality;
  $("stMute").textContent = "聲音：" + (save.settings.muted ? "關" : "開"); $("stShake").textContent = "畫面震動：" + (save.settings.shake ? "開" : "關");
  $("stInfo").textContent = `版本 v${VERSION}　存檔格式 v${SAVE_VERSION}（自動遷移、永不刪除）　目前畫質：${["低", "中", "高"][quality.level]}　已玩 ${save.totals.games} 場`;
}
btn("mSettings", () => { sfx("click"); renderSettings(); show("settings"); });
btn("stBack", () => { sfx("back"); show("menu"); });
$("stMusic").addEventListener("input", (e) => { save.settings.music = +e.target.value; applyAudio(); persist(); });
$("stSfx").addEventListener("input", (e) => { save.settings.sfx = +e.target.value; applyAudio(); persist(); sfx("hit"); });
btn("stMute", () => { save.settings.muted = !save.settings.muted; applyAudio(); persist(); renderSettings(); });
btn("stShake", () => { save.settings.shake = !save.settings.shake; persist(); renderSettings(); });
$("stQ").addEventListener("change", (e) => { save.settings.quality = e.target.value; persist(); quality.auto = e.target.value === "auto"; quality.level = quality.auto ? detectQuality() : +e.target.value; quality.drops = 0; applyQuality(); renderSettings(); });
btn("mCredits", () => { sfx("click"); show("credits"); });
btn("cBack", () => { sfx("back"); show("menu"); });
btn("mIntro", () => { playIntro(true); });
$("verTxt").textContent = "v" + VERSION;

// ---------------- 片頭（移植恐龍防線 v2.2.1：靜音自動播放、點一下開聲音、右上角跳過動畫） ----------------
const iv = $("introV");
let introSound = false;
function introUnmute() {
  if (save.settings.muted) { $("iSound").classList.add("hidden"); return; }
  iv.muted = false; iv.volume = Math.max(0.3, save.settings.music); introSound = true;
  const p = iv.paused ? iv.play() : null; if (p && p.catch) p.catch(() => {});
  $("iSound").classList.add("hidden");
}
function playIntro(fromGesture) {
  AUDIO.stopMusic();
  show("intro"); $("iSkip").classList.remove("hidden"); $("iBigPlay").classList.add("hidden");
  try { iv.currentTime = 0; } catch (e) { /* */ }
  introSound = false;
  if (fromGesture && !save.settings.muted) { AUDIO.unlock(); iv.muted = false; iv.volume = Math.max(0.3, save.settings.music); introSound = true; }
  else iv.muted = true;
  $("iSound").classList.toggle("hidden", introSound || !!save.settings.muted);
  const p = iv.play();
  if (p && p.catch) p.catch(() => {
    if (!iv.muted) { iv.muted = true; introSound = false; const q = iv.play(); if (q && q.catch) q.catch(() => showBigPlay()); $("iSound").classList.toggle("hidden", !!save.settings.muted); }
    else showBigPlay();
  });
}
function showBigPlay() { if (G.screen !== "intro") return; $("iBigPlay").classList.remove("hidden"); $("iSound").classList.add("hidden"); }
function finishIntro() {
  if (G.screen !== "intro") return;
  iv.pause(); $("iBigPlay").classList.add("hidden"); $("iSound").classList.add("hidden"); $("iSkip").classList.add("hidden");
  save.introSeen = true; persist();
  show("menu"); AUDIO.music("menu");
}
iv.addEventListener("ended", finishIntro);
iv.addEventListener("error", () => { if (G.screen === "intro") finishIntro(); });
$("iSkip").onclick = (e) => { e.stopPropagation(); AUDIO.unlock(); sfx("click"); finishIntro(); };
$("iBigPlay").onclick = (e) => { e.stopPropagation(); AUDIO.unlock(); $("iBigPlay").classList.add("hidden"); introUnmute(); const p = iv.play(); if (p && p.catch) p.catch(() => { iv.muted = true; const q = iv.play(); if (q && q.catch) q.catch(() => finishIntro()); }); };
for (const ev of ["pointerup", "click"]) $("intro").addEventListener(ev, (e) => {
  if (G.screen !== "intro" || introSound) return;
  if (e.target && (e.target.closest("#iSkip") || e.target.closest("#iBigPlay"))) return;
  if (!$("iBigPlay").classList.contains("hidden")) return;
  AUDIO.unlock(); introUnmute();
});

// ---------------- 載入 ----------------
function loadImages(list, onEach) { return Promise.all(list.map((src) => new Promise((res) => { const im = new Image(); im.onload = im.onerror = () => { onEach(); res(); }; im.src = src; }))); }
(async function boot() {
  resize(); applyQuality();
  const imgs = ["img/cover.jpg", ...MONSTER_ORDER.map((i) => MONSTERS[i].img), ...SCENE_ORDER.map((i) => SCENES[i].img), "video/intro_poster.jpg"];
  const total = imgs.length + AUDIO.count; let done = 0;
  const tick = () => { done++; $("loadBar").style.width = (done / total * 100).toFixed(0) + "%"; };
  const fontP = document.fonts && document.fonts.load ? document.fonts.load('900 40px "VRTitle"', "方塊巨獸大暴走").catch(() => {}) : Promise.resolve();
  await Promise.all([loadImages(imgs, tick), AUDIO.preload(tick), fontP]);
  G.imgsLoaded = done;
  if (params.has("nointro")) { show("menu"); AUDIO.music("menu"); return; }
  playIntro(false);
})();

// 測試／除錯介面（不影響正常遊戲；不會送出任何網路請求）
Object.assign(window.__vr, {
  startGame, attack, endGame, setPaused, autopilot: (b) => { G.autopilot = !!b; }, pct: () => G.world ? G.world.pct() : 0,
  state: () => ({ screen: G.screen, playing: G.playing, over: G.over, time: G.time, score: G.score, pct: G.world ? G.world.pct() : 0, combo: G.combo, collapsed: G.collapsed, cars: G.cars,
    debris: G.debris ? G.debris.alive : 0, debrisCap: G.debris ? G.debris.cap : 0, falling: G.falling ? G.falling.list.length : 0, fps: G.fps, quality: quality.level, mon: G.mon ? [G.mon.x, G.mon.z] : null, result: G.result || null, tris: renderer.info.render.triangles, monTris: G.mon ? G.mon.g.userData.tris : 0, monLod: G.mon ? G.mon.g.userData.lod : null }),
  setTime: (t) => { G.time = t; }, hit: (x, y, z, r) => hit(x, y, z, r), world: () => G.world, camera, renderer,
});
