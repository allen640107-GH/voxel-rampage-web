# 存檔遷移測試：python3 tests/save_migration.py URL
# v0（無版本）→ v2、v1 → v2、壞掉的 JSON、未來版本：都不能刪掉玩家資料（舊資料原封不動備份）
import asyncio, sys, json
from playwright.async_api import async_playwright
URL = sys.argv[1]; fails = []
def check(c, m):
    print(("PASS " if c else "FAIL ") + m, flush=True)
    if not c: fails.append(m)
K = "voxelRampage.save"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = await (await b.new_context()).new_page(); errs = []
        pg.on("console", lambda m: errs.append(m.text) if m.type in ("error", "warning") else None)
        pg.on("pageerror", lambda e: errs.append(str(e)))
        u = URL + ("&" if "?" in URL else "?") + "nointro"
        await pg.goto(u); await pg.wait_for_selector("#menu", state="visible", timeout=40000)
        async def load_with(raw):
            await pg.evaluate("(r)=>{for(const k of Object.keys(localStorage))localStorage.removeItem(k); localStorage.setItem('%s', r)}" % K, raw)
            await pg.reload(); await pg.wait_for_selector("#menu", state="visible", timeout=40000)
            return await pg.evaluate("(()=>{const o={};for(const k of Object.keys(localStorage))o[k]=localStorage.getItem(k);return o})()")
        # v0
        v0 = json.dumps({"hi": {"downtown": 4321, "harbor": 99}, "mute": True})
        ls = await load_with(v0); s = json.loads(ls[K])
        check(s["v"] == 2 and s["best"]["downtown"]["score"] == 4321 and s["best"]["harbor"]["score"] == 99 and s["settings"]["muted"] is True, f"v0 -> v2 keeps high scores & mute: {s['best']}")
        check(ls.get(K + ".bak.v0") == v0, "v0 original backed up untouched")
        check(await pg.evaluate("__vr.loaded.from") == 0, "loader reports migration from v0")
        # v1
        v1 = json.dumps({"v": 1, "best": {"downtown": {"score": 50000, "stars": 2, "pct": 0.6}}, "unlocked": ["downtown", "harbor"], "music": 0.3, "sfx": 0.4, "muted": False, "quality": "1", "introSeen": True})
        ls = await load_with(v1); s = json.loads(ls[K])
        check(s["v"] == 2 and s["best"]["downtown"]["stars"] == 2 and s["unlocked"]["harbor"] is True and s["unlocked"]["neon"] is False and s["settings"]["music"] == 0.3 and s["settings"]["quality"] == "1" and s["introSeen"] is True, "v1 -> v2 keeps stars, unlocks, settings")
        check(ls.get(K + ".bak.v1") == v1, "v1 original backed up untouched")
        check(await pg.evaluate("document.querySelector('#verTxt').textContent") == "v1.0.0", "game runs after migration")
        # 目前版本：原樣保留
        cur = ls[K]; await pg.reload(); await pg.wait_for_selector("#menu", state="visible")
        check(await pg.evaluate("localStorage.getItem('%s')" % K) == cur, "v2 save untouched on reload")
        # 壞掉的 JSON
        ls = await load_with("{broken json")
        corrupt = [k for k in ls if k.startswith(K + ".corrupt.")]
        check(len(corrupt) == 1 and ls[corrupt[0]] == "{broken json", "corrupt save copied to backup key (never deleted)")
        # 未來版本
        fut = json.dumps({"v": 99, "best": {}, "settings": {"music": 0.5, "sfx": 0.5, "muted": False, "quality": "auto", "shake": True}, "unlocked": {"downtown": True}, "totals": {"games": 1, "voxels": 0, "cars": 0}})
        ls = await load_with(fut)
        check(ls[K] == fut, "newer-version save is not downgraded/overwritten on load")
        check(len(errs) == 0, f"0 console errors {errs[:3]}")
        await b.close()
    print("DONE save_migration FAILS:", len(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
