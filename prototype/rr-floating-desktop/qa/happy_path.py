"""Click through the main flows against the real API and report each step; fails on any console error.

Usage (API on :8000, dev server on :5173):
  pip install playwright && python -m playwright install chromium
  python qa/happy_path.py [http://localhost:5173] [out-dir] [demo-file]

Without a demo file it uploads a stub demo, which only parses when the API runs under qa/dev_api.py.
Set CHROME_PATH to use an installed Chrome instead of Playwright's Chromium.
"""
import asyncio, os, pathlib, sys, tempfile
from playwright.async_api import async_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5173/"
OUT = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else "qa/out")
DEMO = sys.argv[3] if len(sys.argv) > 3 else None
MODEL_WAIT = 180_000  # the local model can take minutes per job; templates are instant


async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    errors: list[str] = []
    results: list[tuple[str, bool, str]] = []
    demo = DEMO
    if not demo:
        fd, demo = tempfile.mkstemp(suffix=".dem")
        os.write(fd, b"PBDEMS2\x00stub")
        os.close(fd)

    async with async_playwright() as p:
        kw = {"executable_path": os.environ["CHROME_PATH"]} if os.environ.get("CHROME_PATH") else {}
        b = await p.chromium.launch(**kw)
        page = await b.new_page(viewport={"width": 1440, "height": 900})
        page.on("console", lambda m: m.type == "error" and errors.append(m.text))
        page.on("pageerror", lambda e: errors.append(str(e)))

        async def shot(name):
            await page.wait_for_timeout(400)
            await page.screenshot(path=str(OUT / f"{name}.png"))

        async def step(name, fn):
            try:
                note = await fn()
                results.append((name, True, note or ""))
            except Exception as e:  # noqa: BLE001 - every failure is reported, then the next step runs
                results.append((name, False, str(e).splitlines()[0][:200]))
                await shot(f"fail-{len(results):02d}")

        win = lambda w: page.locator(f'.win[data-win="{w}"]')
        dock = lambda label: page.locator(f'nav.dock button[aria-label="{label}"]')
        studio = win("studio")

        await page.goto(URL)
        await page.wait_for_selector('.win[data-win="matches"]')

        async def matches():
            await page.wait_for_timeout(800)
            err = win("matches").locator(".err")
            if await err.count():
                raise AssertionError(await err.first.inner_text())
            n = await win("matches").locator("tbody tr").count()
            await shot("01-matches")
            return f"{n} matches listed"

        await step("Matches lists the API's matches", matches)

        async def upload():
            await win("matches").get_by_role("button", name="Add match").click()
            add = win("addMatch")
            await add.get_by_text("Welcome to Add Match").wait_for(timeout=5_000)
            await shot("02a-installer-intro")
            await add.get_by_role("button", name="Continue").click()
            await add.locator('input[type="file"]').set_input_files(demo)
            await shot("02b-installer-demo")
            await add.get_by_role("button", name="Upload").click()
            await add.locator(".inst-bar").wait_for(timeout=10_000)
            await shot("02c-installer-reading")
            await add.get_by_text("Who should the coach review?").wait_for(timeout=120_000)
            await add.locator(".inst-tr.pick-row").first.wait_for(timeout=10_000)
            await page.wait_for_timeout(600)  # kill counts fill in
            await shot("02d-installer-player")
            return "installer: intro, demo, reading progress, player list"

        await step("Upload and parse a demo", upload)

        async def pick():
            add = win("addMatch")
            await add.locator(".inst-tr.pick-row").first.click()
            await add.get_by_role("button", name="Review", exact=True).click()
            try:
                await add.get_by_text("Reviewing").wait_for(timeout=3_000)
                await shot("03a-installer-review")
            except Exception:  # noqa: BLE001 - with templates the review can finish before the step shows
                pass
            await add.get_by_role("button", name="Open in Studio").wait_for(timeout=MODEL_WAIT)
            summary = await add.locator(".inst-done p").first.inner_text()
            await shot("03b-installer-summary")
            return summary

        await step("Pick a player and run the coach", pick)

        async def brief():
            await win("addMatch").get_by_role("button", name="Open in Studio").click()
            await studio.locator(".studio").wait_for(timeout=30_000)
            await studio.locator(".coach-expl .expl").first.wait_for(timeout=MODEL_WAIT)
            text = await studio.locator(".coach-expl .expl").first.inner_text()
            await shot("04-studio-brief")
            return f"summary: {text[:90]}"

        await step("Studio opens on the match brief", brief)

        async def moment():
            await studio.get_by_role("button", name="Review moment 1").click()
            await studio.locator(".coach-expl .expl").first.wait_for(timeout=MODEL_WAIT)
            await page.wait_for_function("document.querySelectorAll('.win[data-win=studio] .r-p').length > 0", timeout=20_000)
            players = await studio.locator(".r-p").count()
            clip = "clip plays" if await studio.locator(".clip video").count() else "no clip (radar takes the stage)"
            await shot("05-studio-moment")
            return f"{players} players on the radar, {clip}"

        await step("Moment 1: explanation, radar, clip", moment)

        async def playback():
            before = await studio.locator(".clock b").inner_text()
            await studio.get_by_role("button", name="Play", exact=True).click()
            await page.wait_for_timeout(1500)
            await studio.get_by_role("button", name="Pause", exact=True).click()
            after = await studio.locator(".clock b").inner_text()
            assert before != after, "the clock did not move"
            await studio.locator(".tl-ev").first.click()
            return f"clock {before} to {after}"

        await step("Play, pause and pick an event", playback)

        async def ask():
            await studio.locator(".seg button", has_text="Ask").click()
            await studio.locator(".ask-tab .q").first.click()
            await page.wait_for_function(
                "!document.querySelector('.win[data-win=studio] .ask-tab .aa .thinking') && document.querySelector('.win[data-win=studio] .ask-tab .aa')",
                timeout=MODEL_WAIT,
            )
            text = await studio.locator(".ask-tab .aa").first.inner_text()
            await shot("06-studio-ask")
            return f"answer: {text[:90]}"

        await step("Ask about the round", ask)

        async def round_tab():
            await studio.locator(".seg button", has_text="Round").click()
            await studio.locator(".round-facts").wait_for(timeout=10_000)
            return "round facts shown"

        await step("Round tab", round_tab)

        async def notes():
            await studio.locator(".seg button", has_text="Notes").click()
            await studio.locator("#note-text").fill("Should I have waited for a teammate here?")
            await studio.get_by_role("button", name="Save note").click()
            await studio.locator(".note-list li").first.wait_for(timeout=10_000)
            await studio.get_by_role("button", name="Ask about this").first.click()
            await studio.locator(".note-list .expl, .note-list .err").first.wait_for(timeout=MODEL_WAIT)
            err = studio.locator(".note-list .err")
            if await err.count():
                raise AssertionError(await err.first.inner_text())
            await shot("07-studio-notes")
            return "note saved and explained"

        await step("Notes: save and ask about a note", notes)

        async def debrief():
            await studio.locator(".seg button", has_text="Analysis").click()
            await studio.get_by_role("button", name="Debrief").click()
            await studio.locator(".coach-expl .expl").first.wait_for(timeout=MODEL_WAIT)
            drills = await studio.locator(".drills li").count()
            await shot("08-studio-debrief")
            return f"wrap-up with {drills} drills"

        await step("Debrief", debrief)

        coach = win("coach")

        async def coach_ask():
            await dock("Coach").click()
            await coach.locator(".coach-ask .q").first.click()
            await page.wait_for_function(
                "!document.querySelector('.win[data-win=coach] .aa .thinking') && document.querySelector('.win[data-win=coach] .aa')",
                timeout=MODEL_WAIT,
            )
            text = await coach.locator(".aa").first.inner_text()
            await shot("09-coach-ask")
            return f"answer: {text[:90]}"

        await step("Coach: ask across matches", coach_ask)

        async def plan():
            await coach.locator(".seg button", has_text="Plan").click()
            await coach.locator(".plan-note .expl, .page .err").first.wait_for(timeout=MODEL_WAIT)
            if await coach.locator(".page .err").count():
                raise AssertionError(await coach.locator(".page .err").first.inner_text())
            items = await coach.locator(".plan-items > li").count()
            await shot("10-coach-plan")
            return f"{items} plan items"

        await step("Coach: practice plan", plan)

        async def knowledge():
            await coach.locator(".seg button", has_text="Knowledge").click()
            await coach.locator(".passages li").first.wait_for(timeout=30_000)
            n = await coach.locator(".passages > li").count()
            await shot("11-coach-knowledge")
            return f"{n} passages"

        await step("Coach: knowledge", knowledge)

        async def progress():
            await dock("Progress").click()
            await win("progress").locator("table.prog tbody tr").first.wait_for(timeout=15_000)
            n = await win("progress").locator("table.prog tbody tr[data-kind]").count()
            await shot("12-progress")
            return f"{n} detector rows"

        await step("Progress", progress)

        async def settings():
            await dock("Settings").click()
            await win("settings").locator(".group li[data-state]").first.wait_for(timeout=10_000)
            states = await win("settings").locator(".group li[data-state]").evaluate_all(
                "els => els.map(e => e.querySelector('.check-name').textContent + ': ' + e.querySelector('.check-state').textContent)"
            )
            await shot("13-settings")
            return ", ".join(states)

        await step("Settings: system checks", settings)

        async def lab():
            await dock("Lab").click()
            lab_win = win("lab")
            await lab_win.locator("table.data tbody tr, .empty").first.wait_for(timeout=15_000)
            runs = await lab_win.locator("table.data tbody tr").count()
            await shot("14-lab-runs")
            return f"{runs} runs"

        await step("Lab: runs", lab)

        async def rerun():
            await dock("Matches").click()
            m = win("matches")
            await m.get_by_role("button", name="Re-run the coach").first.click()
            await m.get_by_role("button", name="Re-run", exact=True).click()
            await m.get_by_text("earlier review kept").first.wait_for(timeout=MODEL_WAIT)
            await shot("15-matches-rerun")
            return "re-run finished, earlier review kept"

        await step("Matches: re-run the coach", rerun)

        await b.close()

    width = max(len(n) for n, _, _ in results)
    for name, ok, note in results:
        print(f"{'PASS' if ok else 'FAIL'}  {name.ljust(width)}  {note}")
    if errors:
        print("\nConsole errors:")
        for e in errors:
            print("  ", e)
    sys.exit(0 if all(ok for _, ok, _ in results) and not errors else 1)


asyncio.run(main())
