"""Screenshot the prototype's main states at desktop, tablet and mobile sizes.

Usage:
  pip install playwright && python -m playwright install chromium
  python tools/qa/screenshots.py prototype/analysis-studio.html out/ [--gsap-dir node_modules/gsap/dist]

With --gsap-dir, GSAP is served from a local copy (use this when the machine has
no internet access; `npm i gsap@3.12.5` provides the files). Google Fonts are
blocked in that mode, so screenshots use fallback fonts.
"""
import argparse, asyncio, pathlib
from playwright.async_api import async_playwright

SIZES = [(1440, 900, "desktop"), (1920, 1080, "desktop-xl"), (1024, 768, "tablet"),
         (834, 1194, "tablet-portrait"), (390, 844, "mobile"), (430, 932, "mobile-xl")]

async def main(src, out, gsap_dir):
    out.mkdir(parents=True, exist_ok=True)
    errors = []
    async def route(r):
        u = r.request.url
        if gsap_dir and "gsap.min.js" in u:
            return await r.fulfill(path=str(gsap_dir / "gsap.min.js"), content_type="text/javascript")
        if gsap_dir and "Flip.min.js" in u:
            return await r.fulfill(path=str(gsap_dir / "Flip.min.js"), content_type="text/javascript")
        if gsap_dir and not u.startswith("file:"):
            return await r.abort()
        await r.continue_()
    async with async_playwright() as p:
        b = await p.chromium.launch(**({"executable_path": __import__("os").environ["CHROME_PATH"]} if __import__("os").environ.get("CHROME_PATH") else {}))
        for w, h, name in SIZES:
            pg = await b.new_page(viewport={"width": w, "height": h})
            pg.on("pageerror", lambda e, n=name: errors.append(f"{n}: {e}"))
            await pg.route("**/*", route)
            await pg.goto(src.resolve().as_uri()); await pg.wait_for_timeout(400)
            await pg.screenshot(path=out / f"{name}-home.png")
            await pg.click("#reviewBtn"); await pg.wait_for_timeout(5600)   # plays to the decision point
            await pg.screenshot(path=out / f"{name}-studio-gameplay.png")
            await pg.evaluate("document.querySelector('#seg button[data-mode=radar]').click()")
            await pg.wait_for_timeout(600)
            await pg.screenshot(path=out / f"{name}-studio-radar.png")
            await pg.evaluate("document.querySelectorAll('#sugg .q')[0].click()")
            await pg.wait_for_timeout(2600)
            await pg.screenshot(path=out / f"{name}-studio-coach.png")
            await pg.click("[data-go=upload]"); await pg.click("#sample"); await pg.wait_for_timeout(3200)
            await pg.screenshot(path=out / f"{name}-processing.png")
            await pg.close()
        await b.close()
    print("\n".join(errors) if errors else "No page errors.")

if __name__ == "__main__":
    a = argparse.ArgumentParser()
    a.add_argument("src", type=pathlib.Path); a.add_argument("out", type=pathlib.Path)
    a.add_argument("--gsap-dir", type=pathlib.Path)
    x = a.parse_args(); asyncio.run(main(x.src, x.out, x.gsap_dir))
