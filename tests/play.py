# 實機模擬測試：python3 tests/play.py URL DEVICE OUTDIR [full]
# 片頭（靜音自動播放、點一下開聲音、跳過動畫）、主選單音樂與切分頁恢復、選巨獸／城市、觸控搖桿與攻擊鍵（或鍵盤）、
# HUD 大字與按鈕在畫面內、自動遊玩一整關到結算、存檔、0 個 console 錯誤、不對外送出任何請求（不會污染任何計數）
import asyncio, sys, time, os
from urllib.parse import urlparse
from playwright.async_api import async_playwright
DEV = {"se": (375, 667, True), "iphone": (390, 844, True), "iphone_land": (844, 390, True),
       "foldcover": (344, 882, True), "foldopen": (884, 1104, True), "pc": (1920, 1080, False)}
URL, D, OUT = sys.argv[1], sys.argv[2], sys.argv[3]; W, H, T = DEV[D]; os.makedirs(OUT, exist_ok=True)
FULL = len(sys.argv) > 4 and sys.argv[4] == "full"
fails = []
def check(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg, flush=True)
    if not cond: fails.append(msg)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--autoplay-policy=user-gesture-required", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        ctx = await b.new_context(viewport={"width": W, "height": H}, has_touch=T, is_mobile=T, device_scale_factor=2 if T else 1)
        pg = await ctx.new_page(); errs = []; foreign = []
        host = urlparse(URL).netloc
        pg.on("console", lambda m: errs.append("console." + m.type + ": " + m.text) if m.type in ("error", "warning") else None)
        pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
        pg.on("request", lambda r: foreign.append(r.url) if urlparse(r.url).netloc not in (host, "") and not r.url.startswith("data:") and not r.url.startswith("blob:") else None)
        async def tap_sel(sel):
            if T: await pg.tap(sel)
            else: await pg.click(sel)
            await pg.wait_for_timeout(150)
        async def tap_xy(x, y):
            if T: await pg.touchscreen.tap(x, y)
            else: await pg.mouse.click(x, y)
            await pg.wait_for_timeout(150)
        async def music_ok(label, want="menu"):
            a = await pg.evaluate("AUDIO.state()"); await pg.wait_for_timeout(900); b2 = await pg.evaluate("AUDIO.state()")
            check(b2["ctx"] == "running" and not b2["paused"] and b2["want"] == want and b2["track"] == want and b2["t"] > a["t"] + 0.2, f"music really playing: {label} (t {a['t']:.2f}->{b2['t']:.2f})")
        async def in_view(sel):
            return await pg.evaluate("""(sel)=>{const e=document.querySelector(sel);if(!e)return false;const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.left>=-1&&r.top>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1}""", sel)
        await pg.goto(URL); await pg.wait_for_timeout(300)
        await pg.evaluate("localStorage.clear()"); await pg.reload()
        await pg.wait_for_timeout(200); await pg.screenshot(path=f"{OUT}/{D}_00_loading.png")
        # ---- 片頭 ----
        await pg.wait_for_selector("#iSkip", state="visible", timeout=40000)
        await pg.wait_for_timeout(1500)
        ia = await pg.evaluate("""(()=>{const v=document.querySelector('#introV'),k=document.querySelector('#iSkip'),r=k.getBoundingClientRect(),h=document.querySelector('#iSound');
          return {screen:__vr.G.screen,t:v.currentTime,paused:v.paused,muted:v.muted,skip:k.textContent,fs:parseFloat(getComputedStyle(k).fontSize),fw:getComputedStyle(k).fontWeight,
          inView:r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,top:r.top,right:innerWidth-r.right,h:r.height,hint:!h.classList.contains('hidden'),big:!document.querySelector('#iBigPlay').classList.contains('hidden')}})()""")
        check(ia["screen"] == "intro" and ia["t"] > 0.3 and not ia["paused"] and ia["muted"] and not ia["big"], f"intro autoplays muted right away {ia}")
        check("跳過動畫" in ia["skip"] and ia["fs"] >= 22 and int(ia["fw"]) >= 800 and ia["inView"] and ia["h"] >= 56 and ia["top"] < 60 and ia["right"] < 60 and ia["hint"], f"big bold 跳過動畫 top-right + 點一下開啟聲音 hint {ia}")
        await pg.screenshot(path=f"{OUT}/{D}_01_intro_muted.png")
        await tap_xy(W * 0.5, H * 0.5); await pg.wait_for_timeout(500)
        un = await pg.evaluate("(()=>{const v=document.querySelector('#introV');return {screen:__vr.G.screen,muted:v.muted,paused:v.paused,vol:v.volume,hint:!document.querySelector('#iSound').classList.contains('hidden')}})()")
        check(un["screen"] == "intro" and not un["muted"] and not un["paused"] and un["vol"] > 0 and not un["hint"], f"one tap turns intro sound on (does not skip) {un}")
        if D in ("pc", "iphone"):
            await pg.wait_for_function("document.querySelector('#introV').currentTime>=4", timeout=30000)
            await pg.screenshot(path=f"{OUT}/{D}_02_intro_4s.png")
            await pg.wait_for_selector("#menu", state="visible", timeout=20000)
            check(True, "intro played to the end -> menu")
        else:
            await tap_sel("#iSkip"); await pg.wait_for_timeout(500)
            check(await pg.evaluate("!document.querySelector('#menu').classList.contains('hidden')"), "跳過動畫 -> menu")
        check(await pg.evaluate("__vr.save().introSeen===true"), "intro remembered in save")
        await pg.wait_for_timeout(800)
        await pg.screenshot(path=f"{OUT}/{D}_03_menu.png")
        for sel in ("#mStart", "#mSettings", "#mCredits"): check(await in_view(sel), f"menu button {sel} fully on screen")
        fs = await pg.evaluate("parseFloat(getComputedStyle(document.querySelector('#mStart')).fontSize)")
        check(fs >= 24, f"menu start button text big ({fs}px)")
        # ---- 音樂：真的在播；切分頁／bfcache 還原自動恢復 ----
        await music_ok("menu after intro")
        await pg.evaluate("Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>'hidden'});document.dispatchEvent(new Event('visibilitychange'))")
        await pg.wait_for_timeout(300); hs = await pg.evaluate("AUDIO.state()")
        check(hs["paused"] and hs["hidden"], "music pauses while tab hidden")
        await pg.evaluate("delete document.hidden;delete document.visibilityState;document.dispatchEvent(new Event('visibilitychange'))")
        await pg.wait_for_timeout(300); await music_ok("tab hidden -> visible (no tap needed)")
        await pg.evaluate("window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}))"); await pg.wait_for_timeout(200)
        await pg.evaluate("window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))"); await pg.wait_for_timeout(300)
        await music_ok("pageshow(persisted) restore")
        # ---- 選巨獸與城市 ----
        await tap_sel("#mStart"); await pg.wait_for_timeout(400)
        check(await pg.evaluate("document.querySelectorAll('[data-mon]').length===3 && document.querySelectorAll('[data-scene]').length===3"), "3 monsters + 3 cities to choose")
        check(await pg.evaluate("!!document.querySelector('[data-scene=harbor] .lock') && !!document.querySelector('[data-scene=neon] .lock')"), "harbor/neon locked on fresh save")
        await pg.screenshot(path=f"{OUT}/{D}_04_select.png")
        mon = "ape" if D in ("se", "foldcover") else "ankylo" if D in ("iphone_land", "foldopen") else "trex"
        await pg.evaluate(f"document.querySelector('[data-mon={mon}]').scrollIntoView({{block:'center'}})"); await pg.wait_for_timeout(200)
        await tap_sel(f"[data-mon={mon}]")
        check(await pg.evaluate(f"document.querySelector('[data-mon={mon}]').classList.contains('sel')"), f"picked monster {mon} by tap")
        check(await in_view("#sGo"), "出發 button on screen")
        await tap_sel("#sGo")
        await pg.wait_for_function("__vr.G.playing===true", timeout=60000); await pg.wait_for_timeout(1500)
        await music_ok("in-game music", want="level1")
        await pg.screenshot(path=f"{OUT}/{D}_05_game.png")
        for sel in ("#hPause", "#hScore", "#hTime", ".ab[data-k='0']", ".ab[data-k='3']"): check(await in_view(sel), f"HUD {sel} fully on screen")
        hf = await pg.evaluate("[parseFloat(getComputedStyle(document.querySelector('#hScore')).fontSize),parseFloat(getComputedStyle(document.querySelector('.ab b')).fontSize),getComputedStyle(document.querySelector('.ab b')).fontWeight]")
        check(hf[0] >= 24 and hf[1] >= 20 and int(hf[2]) >= 800, f"HUD text big & bold {hf}")
        if T:
            check(await in_view(".joyBase"), "virtual joystick on screen")
            # 觸控拖曳搖桿（CDP 觸控事件）→ 巨獸移動
            cdp = await ctx.new_cdp_session(pg)
            r = await pg.evaluate("(()=>{const r=document.querySelector('.joyBase').getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2,r.width]})()")
            p0 = await pg.evaluate("__vr.state().mon")
            await cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": r[0], "y": r[1], "id": 1}]})
            for i in range(1, 6):
                await cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": r[0], "y": r[1] - r[2] * 0.09 * i, "id": 1}]}); await pg.wait_for_timeout(60)
            await pg.wait_for_timeout(1800)
            jin = await pg.evaluate("[__vr.G.input.x,__vr.G.input.y]")
            # 第二根手指同時按攻擊鍵（多點觸控）
            ab = await pg.evaluate("(()=>{const r=document.querySelector('.ab[data-k=\"0\"]').getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()")
            s0 = await pg.evaluate("__vr.state().score")
            await cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": r[0], "y": r[1] - r[2] * 0.45, "id": 1}, {"x": ab[0], "y": ab[1], "id": 2}]})
            await pg.wait_for_timeout(120)
            await cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": [{"x": r[0], "y": r[1] - r[2] * 0.45, "id": 1}]})
            await cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
            await pg.wait_for_timeout(900)
            p1 = await pg.evaluate("__vr.state().mon"); cd = await pg.evaluate("__vr.G.mon.cd[0]")
            moved = ((p1[0] - p0[0]) ** 2 + (p1[1] - p0[1]) ** 2) ** 0.5
            check(jin[1] > 0.3 and moved > 2, f"touch joystick drag moves the monster (input {jin}, moved {moved:.1f})")
            check(await pg.evaluate("__vr.G.input.x===0&&__vr.G.input.y===0"), "joystick released -> stops")
            check(cd > 0 or (await pg.evaluate("__vr.state().score")) > s0, f"second finger on 攻擊鍵 triggers attack while steering (cd {cd:.2f})")
            # 單指點攻擊鍵
            await pg.wait_for_timeout(700); await tap_sel(".ab[data-k='3']")
            ok = True
            try: await pg.wait_for_function("__vr.G.mon.cd[3]>0", timeout=4000)
            except Exception: ok = False
            check(ok, "tap 吼叫 button -> roar")
        else:
            p0 = await pg.evaluate("__vr.state().mon")
            await pg.keyboard.down("w"); await pg.wait_for_timeout(3500); await pg.keyboard.up("w")
            p1 = await pg.evaluate("__vr.state().mon"); moved = ((p1[0] - p0[0]) ** 2 + (p1[1] - p0[1]) ** 2) ** 0.5
            check(moved > 2, f"keyboard W moves monster ({moved:.1f})")
            await pg.keyboard.press("j"); await pg.wait_for_timeout(100)
            check(await pg.evaluate("__vr.G.mon.cd[0]>0"), "J -> stomp")
            await pg.wait_for_timeout(700); await pg.click(".ab[data-k='3']")
            ok = True
            try: await pg.wait_for_function("__vr.G.mon.cd[3]>0", timeout=4000)
            except Exception: ok = False
            check(ok, "click 吼叫 button -> roar (buffered until the stomp animation ends)")
        await pg.wait_for_timeout(1200)
        await pg.screenshot(path=f"{OUT}/{D}_06_attack.png")
        # 暫停
        await tap_sel("#hPause"); await pg.wait_for_timeout(300)
        check(await pg.evaluate("__vr.G.paused && !document.querySelector('#pause').classList.contains('hidden')"), "pause menu")
        await pg.screenshot(path=f"{OUT}/{D}_07_pause.png")
        await tap_sel("#pResume"); await pg.wait_for_timeout(200)
        check(await pg.evaluate("!__vr.G.paused"), "resume")
        # ---- 自動遊玩 ----
        await pg.evaluate("__vr.autopilot(true)")
        t0 = time.time(); shot = False
        while True:
            await pg.wait_for_timeout(4000)
            st = await pg.evaluate("__vr.state()")
            print(f"  autoplay {time.time()-t0:.0f}s time={st['time']:.1f} pct={st['pct']:.3f} score={st['score']} collapsed={st['collapsed']} debris={st['debris']}/{st['debrisCap']} q={st['quality']} fps={st['fps']:.1f}", flush=True)
            if not shot and st["pct"] > 0.12: await pg.screenshot(path=f"{OUT}/{D}_08_rampage.png"); shot = True
            check(st["debris"] <= st["debrisCap"], "debris capped") if st["debris"] > st["debrisCap"] else None
            if st["over"]: break
            if not FULL and time.time() - t0 > 24: await pg.evaluate("__vr.setTime(0.2)")
            if time.time() - t0 > 900: check(False, "autoplay timed out"); break
        await pg.wait_for_timeout(1500)
        res = await pg.evaluate("__vr.state().result")
        check(await pg.evaluate("!document.querySelector('#result').classList.contains('hidden')"), f"result screen shown {res}")
        await pg.screenshot(path=f"{OUT}/{D}_09_result.png")
        for sel in ("#rAgain", "#rSel"): check(await in_view(sel), f"result button {sel} reachable on screen")
        sv = await pg.evaluate("__vr.save()")
        check(sv["v"] == 2 and "downtown" in sv["best"] and sv["best"]["downtown"]["score"] == res["score"], f"best score saved (v{sv['v']})")
        if FULL:
            check(res["stars"] >= 1 and res["reason"] in ("time", "all"), f"autoplay CLEARED the full 90s level: {res['stars']} stars, {res['pct']*100:.0f}%")
            check(sv["unlocked"]["harbor"] is True, "clearing downtown unlocks harbor")
            await music_ok("result music", want="win")
        # 重新開始一局（存檔中有紀錄）
        await tap_sel("#rSel"); await pg.wait_for_timeout(500)
        await pg.screenshot(path=f"{OUT}/{D}_10_select_after.png")
        check(await pg.evaluate("__vr.G.screen==='select'"), "back to select screen")
        check(len(errs) == 0, f"0 console errors/warnings ({len(errs)}): {errs[:5]}")
        check(len(foreign) == 0, f"no third-party requests (nothing counted anywhere): {foreign[:5]}")
        await b.close()
    print("DONE", D, "FAILS:", len(fails))
    for f in fails: print("  FAIL:", f)
    sys.exit(1 if fails else 0)
asyncio.run(main())
