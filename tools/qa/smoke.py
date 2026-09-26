"""Smoke checks for Home, Studio, upload, tablet and mobile."""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright


async def main():
    errors = []
    src = Path("prototype/analysis-studio.html").resolve().as_uri()
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1440, "height": 900})
        page.on("pageerror", lambda e: errors.append(str(e)))
        await page.goto(src)
        await page.wait_for_timeout(300)
        home = await page.evaluate(
            """() => ({
          h: document.querySelector('#nextH').textContent,
          lede: document.querySelector('#nextLede').textContent,
          btn: document.querySelector('#reviewBtn').textContent,
          rail: document.querySelector('#railCount').textContent
        })"""
        )
        print("HOME", home)
        await page.click("#reviewBtn")
        await page.wait_for_timeout(400)
        await page.keyboard.press("v")
        mode = await page.evaluate("() => window.__RR__.S.mode")
        print("after V", mode)
        await page.click("[data-go=upload]")
        await page.evaluate(
            """() => {
          const f = new File(['x'], 'notes.txt', {type:'text/plain'});
          const dt = new DataTransfer(); dt.items.add(f);
          const input = document.querySelector('#file');
          input.files = dt.files;
          input.dispatchEvent(new Event('change'));
        }"""
        )
        err = await page.evaluate("() => document.querySelector('#upErr').textContent")
        print("upload err", err)

        tablet = await browser.new_page(viewport={"width": 834, "height": 1194})
        tablet.on("pageerror", lambda e: errors.append("tablet:" + str(e)))
        await tablet.goto(src)
        await tablet.click("#reviewBtn")
        await tablet.wait_for_timeout(400)
        toggle = await tablet.evaluate("() => document.querySelector('#ctxToggle').textContent")
        print("tablet Analysis btn", repr(toggle))

        mobile = await browser.new_page(viewport={"width": 390, "height": 844})
        mobile.on("pageerror", lambda e: errors.append("mobile:" + str(e)))
        await mobile.goto(src)
        await mobile.click("#reviewBtn")
        await mobile.wait_for_timeout(500)
        peek = await mobile.evaluate("() => document.querySelector('#sheetPeek').textContent")
        print("mobile peek", peek[:80])
        await browser.close()
    print("ERRORS", errors or "none")
    if errors or "isn't a demo" not in err or mode != "radar":
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
