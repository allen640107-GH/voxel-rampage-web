// 存檔：localStorage，含版本號與遷移機制。原則：永不刪除玩家存檔。
// - 遷移前先把舊資料原封不動備份到 voxelRampage.save.bak.v<舊版本>（已存在就不覆蓋）
// - 讀不懂的資料（JSON 壞掉）先備份到 voxelRampage.save.corrupt.<時間>，再用新存檔繼續
export const SAVE_KEY = "voxelRampage.save";
export const SAVE_VERSION = 2;
const SCENES = ["downtown", "harbor", "neon"];
export function defaultSave() {
  return { v: SAVE_VERSION, introSeen: false, monster: "trex", scene: "downtown",
    unlocked: { downtown: true, harbor: false, neon: false },
    best: {}, // best[scene] = { score, stars, pct, monster }
    totals: { games: 0, voxels: 0, cars: 0 }, // 只記在本機，不上傳任何計數
    settings: { music: 0.7, sfx: 0.9, muted: false, quality: "auto", shake: true } };
}
// v0（沒有 v 欄位，早期測試版格式）：{ hi: {downtown: 1234}, mute: true }
// v1：{ v:1, best:{scene:{score,stars}}, unlocked:[scene...], music, sfx, muted, quality }
const MIGRATIONS = {
  0(o) {
    const n = { v: 1, best: {}, unlocked: ["downtown"], music: 0.7, sfx: 0.9, muted: !!o.mute, quality: "auto" };
    for (const k of Object.keys(o.hi || {})) n.best[k] = { score: +o.hi[k] || 0, stars: 0 };
    return n;
  },
  1(o) {
    const n = defaultSave();
    n.introSeen = !!o.introSeen;
    for (const s of SCENES) n.unlocked[s] = s === "downtown" || (Array.isArray(o.unlocked) && o.unlocked.includes(s));
    for (const k of Object.keys(o.best || {})) { const b = o.best[k] || {}; n.best[k] = { score: +b.score || 0, stars: +b.stars || 0, pct: +b.pct || 0, monster: b.monster || "trex" }; }
    n.settings.music = typeof o.music === "number" ? o.music : 0.7; n.settings.sfx = typeof o.sfx === "number" ? o.sfx : 0.9;
    n.settings.muted = !!o.muted; n.settings.quality = o.quality || "auto";
    return n;
  },
};
function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
export function migrate(o) {
  let v = typeof o.v === "number" ? o.v : 0;
  const from = v;
  while (v < SAVE_VERSION && MIGRATIONS[v]) { o = MIGRATIONS[v](o); v = o.v = v + 1; }
  // 補齊新欄位（不移除未知欄位，以免丟資料）
  const d = defaultSave();
  for (const k of Object.keys(d)) if (o[k] === undefined) o[k] = d[k];
  for (const k of Object.keys(d.settings)) if (o.settings[k] === undefined) o.settings[k] = d.settings[k];
  for (const k of Object.keys(d.unlocked)) if (o.unlocked[k] === undefined) o.unlocked[k] = d.unlocked[k];
  for (const k of Object.keys(d.totals)) if (o.totals[k] === undefined) o.totals[k] = d.totals[k];
  o.v = SAVE_VERSION;
  return { save: o, from };
}
export function loadSave() {
  const raw = safeGet(SAVE_KEY);
  if (!raw) return { save: defaultSave(), from: null };
  let o;
  try { o = JSON.parse(raw); if (!o || typeof o !== "object") throw new Error("bad"); }
  catch (e) { safeSet(SAVE_KEY + ".corrupt." + Date.now(), raw); return { save: defaultSave(), from: "corrupt" }; }
  const ov = typeof o.v === "number" ? o.v : 0;
  if (ov < SAVE_VERSION) { const bk = SAVE_KEY + ".bak.v" + ov; if (safeGet(bk) == null) safeSet(bk, raw); }
  if (ov > SAVE_VERSION) return { save: o, from: ov, future: true }; // 較新版本的存檔：照用、不降版
  const r = migrate(o);
  if (r.from !== SAVE_VERSION) safeSet(SAVE_KEY, JSON.stringify(r.save));
  return r;
}
export function writeSave(s) { return safeSet(SAVE_KEY, JSON.stringify(s)); }
