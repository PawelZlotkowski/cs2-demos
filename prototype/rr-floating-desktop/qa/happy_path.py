"""Click through the README happy path and fail on any console error.

Usage (dev server running on :5173):
  pip install playwright && python -m playwright install chromium
  python qa/happy_path.py [http://localhost:5173] [out-dir]

Set CHROME_PATH to use an installed Chrome instead of Playwright's Chromium.
"""
import asyncio, os, pathlib, sys
from playwright.async_api import async_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5173/"
OUT = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else "qa/out")


async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    errors = []
    async with async_playwright() as p:
        kw = {"executable_path": os.environ["CHROME_PATH"]} if os.environ.get("CHROME_PATH") else {}
        b = await p.chromium.launch(**kw)
        page = await b.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
        page.on("console", lambda m: m.type == "error" and errors.append(m.text))
        page.on("pageerror", lambda e: errors.append(str(e)))

        async def shot(name):
            await page.wait_for_timeout(450)
            await page.screenshot(path=str(OUT / f"{name}.png"))

        win = lambda w: page.locator(f'.win[data-win="{w}"]')
        dock = lambda label: page.locator(f'nav.dock button[aria-label="{label}"]')

        await page.goto(URL)
        await page.wait_for_selector('.win[data-win="matches"]')
        await shot("01-desktop-matches")

        await dock("Matches").click()
        await win("matches").locator("tr", has_text="13–9").get_by_role("button", name="Mirage").click()
        await page.wait_for_selector('.win[data-win="studio"] .studio')
        await shot("02-studio-brief")

        studio = win("studio")
        await studio.get_by_role("button", name="Review moment 1").click()
        assert await studio.locator(".s-clip.is-main").count() == 1, "clip should be large by default"
        await shot("03-studio-moment-clip-large")

        await studio.locator(".s-radar.is-peek").click()
        await page.wait_for_timeout(350)
        assert await studio.locator(".s-radar.is-main").count() == 1, "radar should be large after the swap"
        await shot("04-studio-radar-large")
        await studio.locator(".s-clip.is-peek").click()
        await page.wait_for_timeout(350)
        assert await studio.locator(".s-clip.is-main").count() == 1, "clip should be large again"

        await studio.get_by_role("button", name="Play", exact=True).click()
        await page.wait_for_timeout(1500)
        await studio.get_by_role("button", name="Pause", exact=True).click()

        await studio.get_by_role("button", name="Show a round where you did this well").click()
        await page.wait_for_timeout(800)
        await shot("05-studio-done-well")

        await studio.locator(".p-head").get_by_role("button", name="Ask").click()
        await studio.get_by_role("button", name="Why did I die here?").click()
        await page.wait_for_timeout(2000)
        await shot("06-studio-ask")

        await studio.locator(".p-head").get_by_role("button", name="Round").click()
        await shot("07-studio-round")

        await studio.locator(".p-head").get_by_role("button", name="Notes").click()
        await studio.locator("#note-text").fill("Was the Stairs player already there at 0:30?")
        await studio.get_by_role("button", name="Save note").click()
        await studio.get_by_role("button", name="Ask about this").first.click()
        await page.wait_for_timeout(1300)
        await shot("08-studio-notes")

        await dock("Coach").click()
        coach = win("coach")
        await coach.get_by_role("button", name="What mistake do I repeat most across my matches?").click()
        await page.wait_for_timeout(3000)
        await shot("09-coach-ask")
        await coach.get_by_role("button", name="M4:F1").first.click()
        await page.wait_for_timeout(400)
        assert "Anubis" in await studio.locator(".win-title b").inner_text(), "citation should open match M4"
        await dock("Coach").click()
        await coach.get_by_role("button", name="Plan").click()
        await coach.get_by_label("Practised").first.check()
        await shot("10-coach-plan")
        await coach.get_by_role("button", name="Knowledge").click()
        await coach.locator(".zone-list").get_by_role("button", name="Connector").click()
        await shot("11-coach-knowledge")

        await dock("Progress").click()
        await shot("12-progress")

        await page.get_by_role("button", name="Round Reviewer", exact=True).click()
        await page.get_by_role("menuitem", name="Settings…").click()
        await win("settings").get_by_role("switch", name="Lab").click()
        await shot("13-settings-lab-on")
        await dock("Lab").click()
        await win("lab").locator("tbody .row-open").first.click()
        await shot("14-lab-runs")

        bar = win("coach").locator(".titlebar")
        box = await bar.bounding_box()
        await page.mouse.move(box["x"] + 300, box["y"] + 18)
        await page.mouse.down()
        await page.mouse.move(box["x"] + 40, box["y"] + 120, steps=8)
        await page.mouse.up()
        await win("progress").get_by_role("button", name="Minimise").click()
        await page.wait_for_timeout(450)
        await page.locator('nav.dock button[aria-label="Restore Progress"]').click()
        await win("settings").get_by_role("button", name="Close").click()
        await page.wait_for_timeout(700)
        assert await win("settings").count() == 0, "settings should be closed"
        await dock("Settings").click()
        assert await win("settings").count() == 1, "settings should reopen from the dock"
        await dock("Studio").click()
        await shot("15-overlapping-windows")

        await dock("Matches").click()
        await win("matches").get_by_role("button", name="Add match").click()
        add = win("addMatch")
        await add.get_by_role("button", name="Use the sample demo").click()
        await add.get_by_role("button", name="kestrel").first.wait_for(timeout=8000)
        await shot("16-add-match-pick-player")
        await add.locator(".pick-row", has_text="kestrel").first.click()
        await add.get_by_role("button", name="Open in Studio").wait_for(timeout=8000)
        await shot("17-add-match-ready")
        await add.get_by_role("button", name="Open in Studio").click()
        await page.wait_for_timeout(400)
        assert "13–8" in await studio.locator(".win-title b").inner_text(), "the new match should open in the Studio"

        await b.close()
    if errors:
        print("Console errors:\n" + "\n".join(errors))
        sys.exit(1)
    print(f"Happy path passed, screenshots in {OUT}")


asyncio.run(main())
