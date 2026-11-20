---
map: all
side: any
topic: detection_context
source: Round Reviewer research notes 2026-11-20; linked sources in each passage
license: CC-BY-4.0
lang: en
review: source-reviewed; gameplay validation pending
---

# Interpreting candidate events

## Nearby trade outcomes and missed opportunities

Detectors: untraded_death, good_plays.
Keywords: trade, refrag, trading, wymiana, brak trade, kolega.
In Round Reviewer, a nearby trade candidate begins when a teammate dies within the configured radius of the living selected player. A personal trade, another teammate's trade, an interrupted window and no trade are distinct outcomes. The distance filter alone cannot establish a clear shot. Check cover, smoke, blindness, readiness and time before calling a missed opportunity. Damage can demonstrate an attempt; no damage cannot prove there was no attempt. The radius and response window are product settings, not universal game rules. Reference for separating opportunities, attempts and outcomes: [Leetify glossary](https://leetify.com/blog/leetify-stats-glossary/).

## Moving shots require an engagement and weapon context

Detectors: shot_while_moving.
Keywords: movement, counter-strafe, rifle, pistol, strzelanie w ruchu, karabin, pistolet.
A shot event and a measured speed establish an action, not its tactical purpose. Do not call movement a mistake without checking weapon, stance, range, target visibility and engagement timing. The current rifle speed proxy is a review cue. Pistols and scoped weapons need their own calibration; absence of a detector finding is not an endorsement of every moving shot. A kill is not required for a meaningful fight, and a kill does not prove good technique. Reference: [Refrag movement guide](https://refrag.gg/blog/counter-strafing-the-key-to-precision-aim-in-counter-strike-2/).

## Crouched movement is not running

Detectors: shot_while_moving.
Keywords: crouch, crab walk, duck, kucanie.
Do not classify a player as running from horizontal speed alone. Stance and weapon mode can change the meaning of movement. If the parser does not supply stance at the shot, keep the interpretation uncertain. A player moving while crouched is a necessary negative example when calibrating a running-shot detector. Reference: [Refrag counter-strafing exceptions](https://refrag.gg/blog/counter-strafing-the-key-to-precision-aim-in-counter-strike-2/).

## Smoke spam and visibility

Detectors: shot_while_moving, dry_peek.
Keywords: visibility, smoke, wallbang, prefire, widoczność, dym.
An omniscient replay knows more than the player. A map position, spotted flag or damage event does not by itself establish what was visible through smoke or cover. Suppressive fire, wallbangs and prefire may be deliberate. Use recorded POV and appropriate geometry/effect evidence; otherwise describe the observation without asserting an aiming mistake. [Awpy geometry documentation](https://awpy.readthedocs.io/en/stable/visibility.html) is an engineering reference for evaluating sightlines, not proof that this app currently computes them.

## Utility remaining at death needs an earlier opportunity

Detectors: unused_utility, team_flash, good_plays.
Keywords: utility, grenade, flash, unused, granaty, flesz.
Inventory at death establishes what remained. To call it wasted utility, identify a feasible earlier use, the available time and its purpose. Holding a grenade for a later objective or dying unexpectedly may be reasonable. Evaluate a flash against the engagement it enables or disrupts, including the selected player's support contribution. This is Round Reviewer's annotation rule; counts alone do not establish decision quality.

## One engagement can contain several observations

Detectors: shot_while_moving, untraded_death, good_plays, opening_duel.
Keywords: duplicate, episode, repeated, powtórzenie, akcja.
A single fight can include an opening death, a moving burst, a trade and unused utility. Keep the evidence together in one review episode. Do not show the same video again merely because another detector fired. Good and weak aspects can coexist in one action. This is a presentation and labelling policy, not a rule of Counter-Strike.

## Decisions must use information available at the time

Detectors: dry_peek, late_rotation, economy_mismatch, repeated_death_zone.
Keywords: decision, information, uncertainty, decyzja, niepewność.
Judge a decision using what the selected player could know and do before the outcome. The later death does not prove the choice was bad. Repeated deaths in one zone do not establish the same cause. Team plans, communications, baiting and saves may be unobserved. If the proposed explanation depends on missing information, state the missing evidence and keep the judgement uncertain. This is the project's annotation standard.

## Video and telemetry alignment

Detectors: shot_while_moving, opening_duel, good_plays.
Keywords: clip, tick, alignment, TrueView, synchronizacja.
Use the clip's recorded player, round, tick interval and time offset before interpreting an action. A replay image is not exact proof of a subtick input or reaction time. Valve describes differences between server-view demos and predicted playback, including version-dependent behaviour. Check those conditions when the clip seems inconsistent with the event log. Reference: [Valve introducing TrueView](https://store.steampowered.com/news/posts/?appids=730&enddate=1762988292).
