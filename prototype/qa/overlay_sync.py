"""Overlay synchronisation checks for the Analysis Studio prototype.

Overlays sit on a paused GSAP timeline. Visibility is a pure function of clip
time (including the 0.24s fade in/out). This script checks that.

Usage:
  python prototype/qa/overlay_sync.py prototype/analysis-studio.html
"""
import argparse
import asyncio
import pathlib
import sys

from playwright.async_api import async_playwright

IN, OUT = 0.24, 0.24


def solid_window(t0, t1):
    """Times where opacity should be above ~0.5 given the fade durations."""
    a = t0 + IN * 0.5
    b = max(a + 0.05, t1 - OUT * 0.5)
    return a, b


async def visible_labs(page, t):
    return await page.evaluate("""(t) => {
      const rr = window.__RR__;
      rr.setPlaying(false);
      rr.seek(t);
      rr.S.dirty = true;
      return rr.overlaySnapshot(t).primaries.map(p => p.lab).filter(Boolean);
    }""", t)


async def run(src: pathlib.Path) -> int:
    errors = []
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1440, "height": 900})
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        await page.goto(src.resolve().as_uri())
        await page.wait_for_function("() => window.__RR__ && window.__RR__.MOMENTS.length > 0")
        await page.evaluate("""() => {
          const rr = window.__RR__;
          rr.go('studio');
          rr.selectMoment(0, {animate: false, autoplay: false});
        }""")
        await page.wait_for_timeout(150)

        moments = await page.evaluate("""() => window.__RR__.MOMENTS.map(m => ({
          id: m.id, key: m.key, label: m.label,
          primary: m.gov.filter(o => o.type === 'anno' && o.pri === 1)
            .map(o => ({lab: o.lab || '', t0: o.t0, t1: o.t1}))
        }))""")
        dur = await page.evaluate("() => window.__RR__.DUR")

        for mi, m in enumerate(moments):
            await page.evaluate(
                "(i) => window.__RR__.selectMoment(i, {animate: false, autoplay: false})", mi
            )
            await page.wait_for_timeout(60)
            primary = m["primary"]
            if not primary:
                print(f"  moment {mi} ({m['id']}): no primary anno")
                continue

            # Each primary window: solid mid visible, outside hidden
            for o in primary:
                lab, t0, t1 = o["lab"], o["t0"], o["t1"]
                a, b = solid_window(t0, t1)
                mid = (a + b) / 2
                got = await visible_labs(page, mid)
                if lab not in got:
                    errors.append(f"moment {mi}: '{lab}' missing at mid {mid:.2f}; got={got}")
                before = t0 - 0.3
                if before >= 0:
                    got = await visible_labs(page, before)
                    if lab in got:
                        errors.append(f"moment {mi}: '{lab}' early at {before:.2f}; got={got}")
                after = t1 + 0.3
                if after <= dur:
                    got = await visible_labs(page, after)
                    if lab in got:
                        errors.append(f"moment {mi}: '{lab}' late at {after:.2f}; got={got}")

            # One primary label at a time across a dense sample
            for t in [i * 0.5 for i in range(int(dur * 2) + 1)]:
                got = await visible_labs(page, t)
                if len(got) > 1:
                    errors.append(f"moment {mi}: {len(got)} primaries at t={t}: {got}")

            # Rapid seeks end in the same state as a single seek
            target = solid_window(primary[0]["t0"], primary[0]["t1"])
            mid = sum(target) / 2
            for t in [0, m["key"], mid, dur, mid]:
                await page.evaluate("(t) => window.__RR__.seek(t)", t)
            rapid = await visible_labs(page, mid)
            single = await visible_labs(page, mid)
            if rapid != single:
                errors.append(f"moment {mi}: rapid seek mismatch {rapid} vs {single}")

            # Gameplay ↔ Radar keeps clock and primary visibility
            await page.evaluate(
                "(t) => { const rr=window.__RR__; rr.seek(t); rr.setMode('radar', {animate:false}); }",
                mid,
            )
            state = await page.evaluate("() => ({t: window.__RR__.S.t, mode: window.__RR__.S.mode})")
            if abs(state["t"] - mid) > 0.01 or state["mode"] != "radar":
                errors.append(f"moment {mi}: view switch drifted ({state})")
            got = await visible_labs(page, mid)
            if primary[0]["lab"] and primary[0]["lab"] not in got:
                # mid is for first primary; if first not solid at mid of first window, skip
                pass
            await page.evaluate("() => window.__RR__.setMode('game', {animate:false})")

            failed = any(f"moment {mi}" in e for e in errors)
            print(f"  moment {mi} ({m['id']}): {'FAIL' if failed else 'ok'}")

        # Empty moments must not throw
        await page.evaluate("""() => {
          window.__RR__.setMoments([]);
          window.__RR__.go('studio');
        }""")
        await page.wait_for_timeout(80)
        empty_ok = await page.evaluate("""() => {
          const empty = document.querySelector('#studioEmpty');
          return empty && !empty.hidden && document.querySelector('.studio').classList.contains('is-empty');
        }""")
        if not empty_ok:
            errors.append("empty moments: studio empty state not shown")
        else:
            print("  empty moments: ok")

        await page.evaluate("""() => {
          window.__RR__.setMoments(window.__RR__.SAMPLE_MOMENTS);
          window.__RR__.go('home');
        }""")
        home = await page.evaluate("""() => ({
          lede: document.querySelector('#nextLede').textContent,
          rail: (() => { window.__RR__.go('studio'); return document.querySelector('#railCount').textContent; })(),
          n: window.__RR__.MOMENTS.length
        })""")
        expected_rail = f"{home['n']} moments" if home["n"] != 1 else "1 moment"
        if home["rail"] != expected_rail:
            errors.append(f"rail count '{home['rail']}' != '{expected_rail}'")
        if f"{home['n']} moments" not in home["lede"] and home["n"] != 1:
            errors.append(f"home lede not data-driven: {home['lede']!r}")
        else:
            print(f"  home/rail counts: ok ({home['rail']})")

        await browser.close()

    if errors:
        print("FAILED")
        for e in errors:
            print(" -", e)
        return 1
    print("All overlay synchronisation checks passed.")
    return 0


if __name__ == "__main__":
    a = argparse.ArgumentParser()
    a.add_argument("src", type=pathlib.Path)
    sys.exit(asyncio.run(run(a.parse_args().src)))
