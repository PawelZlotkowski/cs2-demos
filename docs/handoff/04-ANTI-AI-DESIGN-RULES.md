# 04 Anti-AI design rules

Related: [03 Design system](./03-DESIGN-SYSTEM.md), [12 Skills](./12-SKILLS-AND-REFERENCES.md), [22 Changelog](./22-CHANGELOG-DESIGN.md)

Two audits removed these patterns: the impeccable detector plus a manual review against Emil Kowalski's principles. Do not reintroduce them.

## The test

> If the game-specific content were removed, could this screen belong to 50 other SaaS applications?

If yes, redesign it.

Product specificity comes from these things, not from decoration:

- the replay
- the tactical radar
- the timeline and its temporal events
- overlays anchored to the footage
- relationships between players
- contextual coaching

## Never add

**Layout**

- Card grids for everything, nested rounded cards, every section boxed
- Equal-sized dashboard modules, artificial symmetry, needless centring
- Large empty hero areas, giant headings
- Generic "Insight", "Summary" or "AI" cards
- A card when spacing or a divider would do

**Surface**

- Large uniform border radius (the maximum is 6px, except the mobile sheet's top corners)
- Gradients as decoration, purple or blue AI gradients, gradient text
- Glow, coloured shadows, glassmorphism, heavy blur
- Shadows on static content
- The "side tab": a thick coloured bar on one edge of a card or label. The first version's hint boxes had one; it was removed.

**Components**

- Pill chips for suggestions or context (they were replaced by text rows and a one-line context sentence)
- Excessive badges or status chips
- Decorative icons, an icon on every button
- Sparkle, magic-wand, brain or robot icons, AI orbs, a floating chat bubble

**Coach**

- Chat bubbles, avatars, "You" and "Coach" name labels
- "How can I help you today?", greetings
- A standalone assistant page

**Copy**

- "Unlock insights", "Your journey", "Performance at a glance", "Welcome back", "Good evening, Pawel"
- Vague adjectives, inspirational filler

**Type**

- Uppercase micro-labels, tracked kicker labels above headings
- Numbered section labels (01 / 02) for content that is not a sequence
- Monospace for decoration

**Motion**

- Page fades, staggered card entrances, hover movement, pulsing or ambient elements, parallax, scroll effects in functional screens

**Stats**

- Decorative statistics, invented numbers, scores with no evidence behind them

## Where colour is allowed

See [03](./03-DESIGN-SYSTEM.md#colour-semantic-roles):

- orange for a mistake
- blue for a good play
- ink for selection

Nothing else is coloured. The footage stays the richest visual element.

## Copy rules

These come from better-writing and the audits:

- Specific and factual, for example "Review moment 1: Dry peek into Connector", not "Continue your journey".
- Verb-first buttons ("Add demo", "Ask", "Review ...").
- Errors say how to fix the problem: "... isn't a demo file. Choose a .dem.zst from FACEIT or a .dem from CS Demo Manager."
- British spelling, sentence case, no em dashes.

## How to check

- Screenshot every changed screen at desktop, tablet and mobile ([17](./17-TESTING-QA.md)).
- Run the impeccable detector ([12](./12-SKILLS-AND-REFERENCES.md#impeccable)) and treat each finding on its merits. Known false positives are listed in [18](./18-CURRENT-STATE.md).
