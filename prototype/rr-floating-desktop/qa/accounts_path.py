"""Click through accounts, roles and the Admin window against the real API with accounts on.

Start the API with accounts on and a fresh data folder (the first account becomes the admin):
  cd apps/api
  RR_DATA_DIR=/tmp/rr-dev-data RR_AUTH_ENABLED=true RR_LAB_ENABLED=1 RR_CSDM_ENABLED=1 RR_CSDM_MODE=stub \\
    RR_SHARE_LINKS=true .venv/bin/python ../../prototype/rr-floating-desktop/qa/dev_api.py
  (in prototype/rr-floating-desktop) RR_API_URL=http://127.0.0.1:8000 npm run dev

Then: python qa/accounts_path.py [http://localhost:5173/] [out-dir]
Fails on any console error. The stub demo only parses under qa/dev_api.py.
"""
import asyncio, os, pathlib, sys
from playwright.async_api import async_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5173/"
OUT = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else "qa/out-accounts")
ADMIN = ("pawel_admin", "correct horse battery", "Pawel")
PLAYER = ("partner_one", "another long password", "Partner")

# Upload the stub demo and review its first T player through the API, as the signed-in browser
UPLOAD_AND_REVIEW = """async () => {
  const form = new FormData();
  form.append('file', new File([new Uint8Array([80,66,68,69,77,83,50,0,115,116,117,98])], 'stub.dem'));
  const up = await (await fetch('/api/matches/upload', { method: 'POST', body: form })).json();
  const until = async (ok) => { for (let i = 0; i < 240; i++) { const s = await (await fetch(`/api/matches/${up.id}/status`)).json(); if (ok(s.status)) return s.status; await new Promise(r => setTimeout(r, 500)); } throw new Error('timed out'); };
  await until((s) => s === 'awaiting_player' || s === 'failed');
  const m = await (await fetch(`/api/matches/${up.id}`)).json();
  const pid = m.players[0].id;
  await fetch(`/api/matches/${up.id}/player`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ playerId: pid, language: 'en' }) });
  return [up.id, await until((s) => s === 'complete' || s === 'failed')];
}"""


async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    errors: list[str] = []
    results: list[tuple[str, bool, str]] = []

    async with async_playwright() as p:
        kw = {"executable_path": os.environ["CHROME_PATH"]} if os.environ.get("CHROME_PATH") else {}
        b = await p.chromium.launch(**kw)
        ctx = await b.new_context(viewport={"width": 1440, "height": 900})
        page = await ctx.new_page()
        page.on("console", lambda m: m.type == "error" and "401" not in m.text and errors.append(m.text))
        page.on("pageerror", lambda e: errors.append(str(e)))

        async def shot(name):
            await page.wait_for_timeout(450)
            await page.screenshot(path=str(OUT / f"{name}.png"))

        async def step(name, fn):
            try:
                note = await fn()
                results.append((name, True, note or ""))
            except Exception as e:  # noqa: BLE001 - every failure is reported, then the next step runs
                results.append((name, False, str(e).splitlines()[0][:200]))
                await shot(f"FAIL-{name.replace(' ', '_')}")

        state = {}

        async def create_admin():
            await page.goto(URL)
            await page.get_by_role("heading", name="Create the admin account").wait_for()
            await shot("01-login-setup")
            await page.get_by_label("Username").fill(ADMIN[0])
            await page.get_by_label("Name shown in the app (optional)").fill(ADMIN[2])
            await page.get_by_label("New password, at least 10 characters").fill(ADMIN[1])
            await page.get_by_role("button", name="Create account").click()
            await page.get_by_role("dialog", name="Welcome").wait_for()

        async def assistant():
            await shot("02-assistant-language")
            await page.get_by_role("radio", name="Polski").click()
            await page.get_by_role("button", name="Continue").click()
            await shot("03-assistant-steam")
            await page.get_by_role("button", name="Continue").click()
            await page.get_by_role("button", name="Start").click()
            await page.get_by_role("dialog", name="Welcome").wait_for(state="detached")
            lang = await page.evaluate("fetch('/api/users/me/settings').then(r => r.json()).then(s => s.language)")
            assert lang == "pl", f"language on the account is {lang}"
            # Back to English for the rest of the run
            await page.evaluate("fetch('/api/users/me/settings', {method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({language:'en', playbackSpeed:1, explanationLength:'normal', autoplayClips:true})})")
            return "Polish saved on the account"

        async def account_menu():
            await page.locator(".mb-account").click()
            await shot("04-account-menu")
            await page.get_by_role("menuitem", name="Admin…").click()
            await page.get_by_role("dialog", name="Admin").wait_for()

        async def admin_sections():
            await page.locator('[data-win="admin"] .light.zoom').click()
            names = ["Overview", "Jobs", "Model and services", "Settings", "Users", "Invites", "Study", "Matches", "Knowledge", "Lab", "Storage and backup", "Security", "Audit log"]
            for n in names:
                await page.locator(".source-item", has_text=n).first.click()
                await page.locator(".split-body .pane-h h1").wait_for()
                await page.wait_for_timeout(250)
                slug = n.lower().replace(" ", "-")
                if n in ("Overview", "Users", "Settings", "Lab", "Storage and backup", "Audit log"):
                    await shot(f"05-admin-{slug}")
            return f"{len(names)} sections"

        async def invite():
            await page.locator(".source-item", has_text="Invites").click()
            await page.get_by_role("button", name="Create Code").click()
            code = await page.locator(".secret code").first.inner_text()
            state["code"] = code
            await shot("06-admin-invite")
            return f"code …{code[-4:]}"

        async def review_match():
            mid, status = await page.evaluate(UPLOAD_AND_REVIEW)
            state["match"] = mid
            assert status == "complete", status
            await page.evaluate("1")
            return mid[:8]

        async def matches_actions():
            await page.locator('[data-win="admin"] .light.close').click()
            await page.locator(".dock-item[aria-label='Matches']").click()
            await page.locator("table.data .more-btn").first.wait_for()
            await page.locator("table.data .more-btn").first.click()
            await shot("07-matches-row-menu")
            await page.get_by_role("menuitem", name="Rename…").click()
            await page.locator(".sheet .field").fill("Scrim vs Kestrel")
            await shot("08-rename-sheet")
            await page.get_by_role("button", name="Rename").click()
            await page.get_by_role("button", name="Scrim vs Kestrel").wait_for()
            await page.locator("table.data .more-btn").first.click()
            await page.get_by_role("menuitem", name="Share Link…").click()
            await page.get_by_role("button", name="Make Link").click()
            link = await page.locator(".sheet .secret code").inner_text()
            state["share"] = link
            await shot("09-share-sheet")
            await page.get_by_role("button", name="Done").click()
            return link.split("/r/")[0] + "/r/…"

        async def studio_feedback():
            await page.get_by_role("button", name="Scrim vs Kestrel").click()
            await page.locator('[data-win="studio"]').wait_for()
            await page.locator(".fb-btn", has_text="Useful").first.wait_for(timeout=30000)
            await page.locator(".fb-btn", has_text="Useful").first.click()
            await page.get_by_text("Thanks").first.wait_for()
            await shot("10-studio-feedback")
            fb = await page.evaluate(f"fetch('/api/matches/{state['match']}/feedback').then(r => r.json())")
            assert fb and fb[0]["verdict"] == "useful", fb
            return f"{len(fb)} saved"

        async def settings_panes():
            await page.locator('[data-win="studio"] .light.close').click()
            await page.locator(".mb-account").click()
            await page.get_by_role("menuitem", name="Profile…").click()
            await page.get_by_role("dialog", name="Settings").wait_for()
            await shot("11-settings-profile")
            for n in ("Coach and playback", "Signed in", "Your data", "System", "Connect another app"):
                await page.locator(".source-item", has_text=n).click()
                await page.wait_for_timeout(200)
                if n in ("Coach and playback", "Signed in", "Your data"):
                    await shot(f"12-settings-{n.split()[0].lower()}")

        async def sign_out():
            await page.locator(".mb-account").click()
            await page.get_by_role("menuitem", name=f"Sign Out {ADMIN[2]}…").click()
            await page.get_by_role("heading", name="Round Reviewer").wait_for()
            await shot("13-login")

        async def player_signup():
            await page.get_by_role("button", name="Create an account").click()
            await page.get_by_label("Username").fill(PLAYER[0])
            await page.get_by_label("New password, at least 10 characters").fill(PLAYER[1])
            await page.get_by_label("Invite code").fill(state["code"])
            await shot("14-login-invite")
            await page.get_by_role("button", name="Create account").click()
            await page.get_by_role("dialog", name="Welcome").wait_for()
            for _ in range(2):
                await page.get_by_role("button", name="Continue").click()
            await page.get_by_role("button", name="Start").click()
            await page.locator(".mb-account").click()
            items = await page.get_by_role("menuitem").all_inner_texts()
            assert not any("Admin" in i for i in items), items
            await page.keyboard.press("Escape")
            assert await page.locator(".dock-item[aria-label='Admin']").count() == 0
            await page.get_by_text("No matches yet.").wait_for()
            await shot("15-player-desktop")
            return "no Admin, no matches of the admin's"

        async def shared_link():
            other = await ctx.browser.new_context(viewport={"width": 1200, "height": 860})
            pg = await other.new_page()
            await pg.goto(state["share"])
            await pg.get_by_text("shared read-only").wait_for()
            await pg.wait_for_timeout(400)
            await pg.screenshot(path=str(OUT / "16-shared-review.png"))
            await other.close()

        async def wrong_password():
            await page.locator(".mb-account").click()
            await page.get_by_role("menuitem", name="Sign Out").click()
            await page.get_by_label("Username").fill(ADMIN[0])
            await page.get_by_label("Password").fill("wrong password")
            await page.get_by_role("button", name="Sign in").click()
            await page.locator(".login-err").wait_for()
            await shot("17-login-error")

        await step("create the admin account", create_admin)
        await step("setup assistant", assistant)
        await step("account menu opens Admin", account_menu)
        await step("every admin section", admin_sections)
        await step("make an invite", invite)
        await step("upload and review a match", review_match)
        await step("rename and share from Matches", matches_actions)
        await step("feedback in the Studio", studio_feedback)
        await step("settings panes", settings_panes)
        await step("sign out", sign_out)
        await step("sign up with the invite", player_signup)
        await step("share link without signing in", shared_link)
        await step("wrong password", wrong_password)
        await b.close()

    ok = all(r[1] for r in results) and not errors
    for name, passed, note in results:
        print(f"{'PASS' if passed else 'FAIL'}  {name}{f'  ({note})' if note else ''}")
    for e in errors:
        print("CONSOLE", e[:300])
    sys.exit(0 if ok else 1)


asyncio.run(main())
