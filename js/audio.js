"use strict";
// 方塊巨獸大暴走：音訊系統（移植自「恐龍防線」v2.2.1 修正版）。
// 音效＝預先解碼的 WebAudio 緩衝；音樂＝串流 <audio> 經 GainNode 控制音量。所有音檔來源與授權見 CREDITS.md。
// 手機觸控的 pointerdown 不一定算「使用者啟用」手勢 → 每次手勢（pointerdown／pointerup／touchend／click／keydown）都檢查，
// 直到 AudioContext 真的 running、音樂真的在播放為止；切回分頁（visibilitychange）、bfcache 還原（pageshow）、focus 時自動恢復。
const AUDIO = (() => {
  const SFX_NAMES = ["click", "back", "deny", "boom", "meteor", "erupt", "rock", "shatter", "hit", "roar1", "roar2", "roar3",
    "boss", "sk_stomp", "sk_charge", "sk_gust", "achieve", "coin", "wave"];
  const LIMIT = { rock: 4, hit: 4, shatter: 3, boom: 3, coin: 3 };
  let ctx = null, master = null, sfxGain = null, musicGain = null, unlocked = false;
  const buffers = {}, raw = {}, playing = {}, lastAt = {};
  let muted = false, vMusic = 0.7, vSfx = 0.9;
  let musicEl = null, musicSrc = null, curTrack = null, wantTrack = null;
  function ensureCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ctx = new AC(); master = ctx.createGain(); master.connect(ctx.destination);
    sfxGain = ctx.createGain(); sfxGain.connect(master); musicGain = ctx.createGain(); musicGain.connect(master);
    applyVol(); return ctx;
  }
  function applyVol() { if (!ctx) return; master.gain.value = muted ? 0 : 1; sfxGain.gain.value = vSfx; musicGain.gain.value = vMusic * 0.8; }
  function preload(onEach) {
    return Promise.all(SFX_NAMES.map((n) => fetch("audio/sfx/" + n + ".mp3").then((r) => r.ok ? r.arrayBuffer() : null)
      .then((b) => { raw[n] = b; if (onEach) onEach(); }).catch(() => { if (onEach) onEach(); })));
  }
  function decodeAll() {
    if (!ctx) return;
    for (const n of SFX_NAMES) {
      if (buffers[n] || !raw[n]) continue;
      const data = raw[n]; raw[n] = null;
      try { const p = ctx.decodeAudioData(data, (b) => { buffers[n] = b; }, () => {}); if (p && p.catch) p.catch(() => {}); } catch (e) { /* */ }
    }
  }
  let hold = false, hidden = false, lastTry = 0;
  function musicOk() { return !wantTrack || hold || (musicEl && curTrack === wantTrack && (!musicEl.paused || musicEl.ended)); }
  function healthy() { return ctx && ctx.state === "running" && musicOk(); }
  function unlock() {
    ensureCtx(); if (!ctx) return;
    if (ctx.state !== "running") { try { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* */ } }
    try { const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0); } catch (e) { /* */ }
    if (!unlocked) { unlocked = true; decodeAll(); }
    if (!hidden && !musicOk()) music(wantTrack, true);
  }
  function gesture() { if (hidden) return; if (!unlocked || !healthy()) unlock(); }
  function onHide() { hidden = true; if (musicEl && !musicEl.paused) musicEl.pause(); }
  function onShow() {
    hidden = false; if (!ctx) return;
    if (ctx.state !== "running") { try { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* */ } }
    if (unlocked && !musicOk() && wantTrack) { const p = musicEl && curTrack === wantTrack ? musicEl.play() : (music(wantTrack, true), null); if (p && p.catch) p.catch(() => {}); }
  }
  if (typeof document !== "undefined") {
    for (const ev of ["pointerdown", "pointerup", "touchend", "click", "keydown"]) document.addEventListener(ev, gesture, { capture: true, passive: true });
    document.addEventListener("visibilitychange", () => { if (document.hidden) onHide(); else onShow(); });
    window.addEventListener("pagehide", onHide);
    window.addEventListener("pageshow", (e) => { if (e.persisted || hidden) onShow(); });
    window.addEventListener("focus", () => { if (!document.hidden) onShow(); });
    setInterval(() => { if (!hidden && unlocked && ctx && ctx.state === "running" && !musicOk() && performance.now() - lastTry > 1800) { lastTry = performance.now(); onShow(); } }, 2000);
  }
  function play(n, opt) {
    if (!ctx || !unlocked || muted) return;
    const b = buffers[n]; if (!b) return;
    const now = ctx.currentTime, lim = LIMIT[n] || 3;
    playing[n] = (playing[n] || []).filter((t) => t > now);
    if (playing[n].length >= lim) return;
    if (lastAt[n] && now - lastAt[n] < 0.06) return;
    lastAt[n] = now;
    const s = ctx.createBufferSource(); s.buffer = b;
    const g = ctx.createGain(); g.gain.value = (opt && opt.vol) || 1;
    s.playbackRate.value = (opt && opt.rate) ? opt.rate : 0.92 + Math.random() * 0.16;
    s.connect(g); g.connect(sfxGain); s.start(0);
    playing[n].push(now + b.duration / s.playbackRate.value);
  }
  function music(name, force) {
    wantTrack = name; hold = false;
    if (!unlocked || hidden) return;
    if (!force && curTrack === name && musicEl && !musicEl.paused) return;
    curTrack = name;
    if (!musicEl) {
      musicEl = new Audio(); musicEl.preload = "auto"; musicEl.crossOrigin = "anonymous";
      musicEl.setAttribute("playsinline", ""); musicEl.addEventListener("error", () => {});
      try { musicSrc = ctx.createMediaElementSource(musicEl); musicSrc.connect(musicGain); } catch (e) { musicSrc = null; }
    }
    if (!name) { musicEl.pause(); return; }
    musicEl.loop = !(name === "win" || name === "lose");
    musicEl.src = "audio/music/" + name + ".mp3";
    if (!musicSrc) musicEl.volume = muted ? 0 : vMusic;
    if (musicGain) { const t = ctx.currentTime; musicGain.gain.cancelScheduledValues(t); musicGain.gain.setValueAtTime(0.0001, t); musicGain.gain.linearRampToValueAtTime(vMusic * 0.8, t + 1.2); }
    lastTry = performance.now();
    const p = musicEl.play(); if (p && p.catch) p.catch(() => { /* 被拒絕：下一次手勢會再試 */ });
  }
  function stopMusic() { wantTrack = null; curTrack = null; if (musicEl) musicEl.pause(); }
  function pauseMusic(b) { hold = !!b; if (!musicEl || !curTrack) return; if (b) musicEl.pause(); else if (!hidden) { const p = musicEl.play(); if (p && p.catch) p.catch(() => {}); } }
  function state() { return { ctx: ctx ? ctx.state : "none", unlocked, want: wantTrack, track: curTrack, paused: musicEl ? musicEl.paused : true, t: musicEl ? musicEl.currentTime : 0, hidden, hold }; }
  function set(o) {
    if ("muted" in o) muted = !!o.muted; if ("music" in o) vMusic = o.music; if ("sfx" in o) vSfx = o.sfx;
    applyVol(); if (musicEl && !musicSrc) musicEl.volume = muted ? 0 : vMusic;
  }
  return { preload, unlock, play, state, onHide, onShow, music, stopMusic, pauseMusic, set, get unlocked() { return unlocked; }, count: SFX_NAMES.length,
    get ready() { return Object.keys(buffers).length; } };
})();
window.AUDIO = AUDIO;
