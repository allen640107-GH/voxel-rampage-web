// 巨獸：以小體素拼出的模型（每個部位一個網格，可旋轉做動畫）
import * as THREE from "../vendor/three.module.js";
import { meshVoxels, toGeometry, defineMat } from "./world.js";

defineMat(40, 0x5f9e3a); defineMat(41, 0x3c6b26); defineMat(42, 0x6b4a2a); defineMat(43, 0xc7cf8a); defineMat(44, 0xf2eedd); defineMat(45, 0x8a2a3a); defineMat(46, 0xffd21e, { g: 1 }); defineMat(47, 0xe8e2cf);
defineMat(50, 0x404046); defineMat(51, 0x2a2a2f); defineMat(52, 0x77716b); defineMat(53, 0xff9a1a, { g: 1 }); defineMat(54, 0x56565e);
defineMat(60, 0x6c7078); defineMat(61, 0x484c55); defineMat(62, 0x2fb8ff, { g: 1 }); defineMat(63, 0x9be8ff, { g: 1 }); defineMat(64, 0x2a7bff, { g: 1 });

const mir = (b) => [-b[3], b[1], b[2], -b[0], b[4], b[5], b[6]];
function trexParts() {
  const body = [[-5, 9, -6, 5, 18, 6, 40], [-4, 8, -4, 4, 8, 5, 43], [-4, 9, 6, 4, 16, 7, 43], [-1, 19, -6, 1, 19, 5, 41]];
  for (let z = -6; z <= 5; z += 3) body.push([-5, 18, z, 5, 18, z, 42]);
  const head = [[-4, 16, 5, 4, 21, 14, 40], [-3, 22, 8, 3, 22, 13, 41], [-4, 21, 7, 4, 21, 9, 42], [4, 19, 10, 4, 19, 11, 46], [-4, 19, 10, -4, 19, 11, 46]];
  for (let z = 7; z <= 13; z += 2) head.push([3, 15, z, 3, 15, z, 44], [-3, 15, z, -3, 15, z, 44]);
  for (let x = -2; x <= 2; x += 2) head.push([x, 15, 14, x, 15, 14, 44]);
  const jaw = [[-3, 12, 6, 3, 14, 13, 41], [-2, 14, 7, 2, 14, 12, 45]];
  for (let z = 8; z <= 12; z += 2) jaw.push([3, 15, z, 3, 15, z, 44], [-3, 15, z, -3, 15, z, 44]);
  const legL = [[2, 5, -4, 7, 13, 2, 40], [3, 2, -3, 6, 5, 0, 41], [2, 0, -3, 7, 1, 3, 41], [2, 0, 4, 2, 0, 4, 47], [4, 0, 4, 5, 0, 4, 47], [7, 0, 4, 7, 0, 4, 47]];
  return {
    body: { pivot: [0, 13, 0], boxes: body },
    head: { parent: "body", pivot: [0, 17, 5], boxes: head },
    jaw: { parent: "head", pivot: [0, 15, 6], boxes: jaw },
    arms: { parent: "body", pivot: [0, 14, 6], boxes: [[3, 11, 6, 4, 14, 8, 41], [-4, 11, 6, -3, 14, 8, 41], [3, 10, 8, 4, 10, 9, 47], [-4, 10, 8, -3, 10, 9, 47]] },
    legL: { pivot: [4, 12, -1], boxes: legL }, legR: { pivot: [-4, 12, -1], boxes: legL.map(mir) },
    tail1: { parent: "body", pivot: [0, 15, -6], boxes: [[-4, 11, -12, 4, 17, -7, 40], [-4, 17, -8, 4, 17, -8, 42], [-4, 17, -11, 4, 17, -11, 42]] },
    tail2: { parent: "tail1", pivot: [0, 15, -12], boxes: [[-3, 12, -19, 3, 16, -13, 40], [-3, 16, -15, 3, 16, -15, 42], [-3, 16, -18, 3, 16, -18, 42]] },
    tail3: { parent: "tail2", pivot: [0, 15, -19], boxes: [[-2, 13, -27, 2, 15, -20, 41]] },
  };
}
function apeParts() {
  const leg = [[1, 2, -3, 6, 14, 3, 50], [1, 0, -3, 6, 1, 4, 51]];
  const arm = [[7, 14, -3, 11, 27, 3, 50], [7, 3, -4, 12, 13, 4, 51], [7, 12, -3, 11, 13, 3, 54]];
  return {
    body: { pivot: [0, 14, 0], boxes: [[-7, 14, -4, 7, 27, 4, 50], [-5, 16, 5, 5, 24, 5, 54], [-6, 25, -4, 6, 28, 3, 51]] },
    head: { parent: "body", pivot: [0, 27, 1], boxes: [[-4, 27, -2, 4, 35, 5, 50], [-3, 27, 6, 3, 32, 6, 52], [-4, 32, 6, 4, 33, 7, 51], [-2, 31, 7, -2, 31, 7, 53], [2, 31, 7, 2, 31, 7, 53], [-1, 29, 7, 1, 30, 7, 51]] },
    jaw: { parent: "head", pivot: [0, 28, 5], boxes: [[-3, 26, 2, 3, 27, 6, 52], [-2, 27, 6, 2, 27, 6, 45]] },
    armL: { parent: "body", pivot: [9, 26, 0], boxes: arm }, armR: { parent: "body", pivot: [-9, 26, 0], boxes: arm.map(mir) },
    legL: { pivot: [3, 14, 0], boxes: leg }, legR: { pivot: [-3, 14, 0], boxes: leg.map(mir) },
  };
}
function ankyloParts() {
  const body = [[-8, 7, -11, 8, 15, 10, 60], [-7, 16, -10, 7, 16, 9, 61], [-8, 10, -11, 8, 10, 10, 61]];
  let k = 0;
  for (const z of [-8, -3, 2, 7]) for (const x of [-5, 0, 5]) { const h = 3 + ((k++ * 7) % 3); body.push([x - 1, 17, z, x, 16 + h, z + 1, 62], [x - 1, 17 + h, z, x, 17 + h, z + 1, 63]); }
  for (const z of [-9, -4, 1, 6]) body.push([9, 11, z, 10, 11, z + 1, 63], [-10, 11, z, -9, 11, z + 1, 63]);
  const leg = (px, pz) => [[px - 2, 0, pz - 2, px + 2, 8, pz + 2, 61], [px - 2, 0, pz + 3, px + 2, 0, pz + 3, 47]];
  return {
    body: { pivot: [0, 8, 0], boxes: body },
    head: { parent: "body", pivot: [0, 9, 10], boxes: [[-4, 5, 11, 4, 11, 17, 60], [-4, 12, 11, 4, 12, 15, 61], [4, 10, 15, 4, 10, 15, 64], [-4, 10, 15, -4, 10, 15, 64], [4, 12, 11, 5, 13, 12, 63], [-5, 12, 11, -4, 13, 12, 63], [-2, 5, 18, 2, 7, 18, 61]] },
    jaw: { parent: "head", pivot: [0, 6, 12], boxes: [[-3, 4, 12, 3, 5, 17, 61]] },
    legL: { pivot: [6, 8, 7], boxes: leg(6, 7) }, legR: { pivot: [-6, 8, 7], boxes: leg(-6, 7) },
    legL2: { pivot: [6, 8, -7], boxes: leg(6, -7) }, legR2: { pivot: [-6, 8, -7], boxes: leg(-6, -7) },
    tail1: { parent: "body", pivot: [0, 11, -11], boxes: [[-3, 9, -19, 3, 13, -12, 60], [-1, 14, -17, 0, 15, -16, 63]] },
    tail2: { parent: "tail1", pivot: [0, 11, -19], boxes: [[-2, 10, -26, 2, 12, -20, 61]] },
    tail3: { parent: "tail2", pivot: [0, 11, -26], boxes: [[-5, 7, -32, 5, 14, -27, 61], [-6, 10, -30, -6, 11, -29, 63], [6, 10, -30, 6, 11, -29, 63], [-1, 15, -30, 1, 16, -29, 63], [-1, 7, -33, 1, 13, -33, 60]] },
  };
}

export const MONSTERS = {
  trex: { id: "trex", name: "暴龍・雷克斯", img: "img/m_trex.png", vs: 0.56, speed: 10, bodyR: 3.0, parts: trexParts,
    desc: "平衡型：甩尾範圍大", stats: { 速度: 3, 力量: 3, 範圍: 4 }, labels: ["踩踏", "甩尾", "衝撞", "吼叫"],
    stomp: { fwd: 4.5, r: 4.2 }, tail: { dist: 10, r: 3.4, y: 5 }, charge: { fwd: 6, r: 3.6, y: 5, mult: 2.6, dur: 0.7 }, roar: { R: 18, r: 4.5 },
    cd: [0.55, 1.1, 3.0, 7.0], roarSfx: "boss" },
  ape: { id: "ape", name: "巨猿・剛猛", img: "img/m_ape.png", vs: 0.46, speed: 12.5, bodyR: 3.0, parts: apeParts,
    desc: "速度型：移動快、捶地猛", stats: { 速度: 5, 力量: 3, 範圍: 3 }, labels: ["捶地", "橫掃", "衝撞", "捶胸吼"],
    stomp: { fwd: 4, r: 5.0 }, tail: { dist: 5.5, r: 4.0, y: 7 }, charge: { fwd: 5, r: 3.6, y: 7, mult: 2.8, dur: 0.65 }, roar: { R: 15, r: 4.5 },
    cd: [0.5, 0.9, 2.4, 6.5], roarSfx: "roar2" },
  ankylo: { id: "ankylo", name: "晶甲獸・鐵甲", img: "img/m_ankylo.png", vs: 0.56, speed: 7.5, bodyR: 3.8, parts: ankyloParts,
    desc: "重裝型：慢，但破壞範圍最大", stats: { 速度: 2, 力量: 5, 範圍: 5 }, labels: ["重踏", "錘尾", "頭槌", "晶震吼"],
    stomp: { fwd: 6, r: 5.3 }, tail: { dist: 15, r: 4.4, y: 4 }, charge: { fwd: 9, r: 4.4, y: 4, mult: 2.4, dur: 0.8 }, roar: { R: 22, r: 5.0 },
    cd: [0.7, 1.3, 3.4, 8.0], roarSfx: "roar1" },
};
export const MONSTER_ORDER = ["trex", "ape", "ankylo"];

export function buildMonster(id, mats) {
  const def = MONSTERS[id], P = def.parts(), vs = def.vs;
  const root = new THREE.Group(), nodes = {};
  const names = Object.keys(P);
  const make = (n) => {
    if (nodes[n]) return nodes[n];
    const p = P[n], g = new THREE.Group();
    const map = new Map(); let bx0 = 1e9, by0 = 1e9, bz0 = 1e9, bx1 = -1e9, by1 = -1e9, bz1 = -1e9;
    for (const [x0, y0, z0, x1, y1, z1, m] of p.boxes) {
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) map.set(x + "," + y + "," + z, m);
      bx0 = Math.min(bx0, x0, x1); by0 = Math.min(by0, y0, y1); bz0 = Math.min(bz0, z0, z1); bx1 = Math.max(bx1, x0, x1); by1 = Math.max(by1, y0, y1); bz1 = Math.max(bz1, z0, z1);
    }
    const get = (x, y, z) => map.get(x + "," + y + "," + z) || 0;
    const res = meshVoxels(get, bx0, by0, bz0, bx1 - bx0 + 1, by1 - by0 + 1, bz1 - bz0 + 1, p.pivot[0] + 0.5, p.pivot[1], p.pivot[2] + 0.5);
    for (const [j, mat] of [[0, mats.mon], [1, mats.monGlow]]) { const geo = toGeometry(res[j]); if (geo) { const ms = new THREE.Mesh(geo, mat); ms.castShadow = true; ms.scale.setScalar(vs); g.add(ms); } }
    const par = p.parent ? make(p.parent) : null, pp = p.parent ? P[p.parent].pivot : [0, 0, 0];
    g.position.set((p.pivot[0] - pp[0]) * vs, (p.pivot[1] - pp[1]) * vs, (p.pivot[2] - pp[2]) * vs);
    (par || root).add(g); nodes[n] = g; g.userData.base = g.position.clone();
    return g;
  };
  for (const n of names) make(n);
  root.userData.nodes = nodes;
  return root;
}
