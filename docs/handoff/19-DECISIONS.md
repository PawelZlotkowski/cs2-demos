# 19 Decisions

Related: [01 Product scope](./01-PRODUCT-SCOPE.md), [04 Anti-AI rules](./04-ANTI-AI-DESIGN-RULES.md), [22 Changelog](./22-CHANGELOG-DESIGN.md)

Don't reverse any of these without the owner's approval. Each lists the decision, the reason and the consequence.

1. **Gameplay or radar is the primary surface.**
   - *Reason:* the replay is what the user came to understand.
   - *Consequence:* the side columns stay narrow, the panel can be hidden, the stage takes leftover width, and there are no dashboard modules.
2. **The LLM interprets structured analysis; it never replaces it.**
   - *Reason:* trust and evaluability.
   - *Consequence:* every claim cites a finding ID, numbers come from code, and there is a verifier in the pipeline.
3. **About 5 or 6 selected moments per match.**
   - *Reason:* learning value over exhaustiveness.
   - *Consequence:* a ranker with a stated "picked because" reason, and no full event log in the UI.
4. **Semantic colour: orange for a mistake, blue for a good play, ink for everything structural.**
   - *Reason:* colour must mean something.
   - *Consequence:* no category colours. Shapes (▲ ● ◇) carry meaning alongside colour.
5. **No generic chatbot.**
   - *Reason:* the Coach is a contextual query layer.
   - *Consequence:* it lives in the panel's Ask tab. No bubbles, avatars, greetings or standalone page.
6. **No generic dashboard cards.**
   - *Reason:* they fail the product-specificity test.
   - *Consequence:* use lists, tables, spacing and dividers, a maximum 6px radius, and no shadows on static content.
7. **The timeline is first-class.**
   - *Reason:* the product is time-based.
   - *Consequence:* a labelled Coach lane, an interval bracket, previous and next event, slider semantics, and linked states.
8. **Gameplay and Radar share one clock and one context.**
   - *Consequence:* switching views never changes the time, the moment, the overlays or the Coach context.
9. **Video time is authoritative.**
   - *Consequence:* overlays sit on a paused GSAP timeline set from media time. There are never free-running overlay animations.
10. **One primary overlay at a time.**
    - *Reason:* the footage must stay readable.
    - *Consequence:* secondary marks at 55% opacity and sequenced in time; secondary text labels are hidden on mobile.
11. **A shared label per moment.**
    - *Reason:* the stage, timeline and panel must read as one instrument.
    - *Consequence:* the same words and the same outlined "live" chip in all three places.
12. **Restrained motion.**
    - *Consequence:* GSAP only for time, space and continuity; CSS for small state changes; instant keyboard actions; reduced motion respected.
13. **Visible personalisation, evidence only.**
    - *Consequence:* every "N of M" claim is shown with dots and the list of matches. No gamification.
14. **Stage-first responsive behaviour.**
    - *Consequence:* secondary UI collapses first. Tablet uses a drawer and mobile uses a bottom sheet with the key finding visible when collapsed.
15. **Honest processing.**
    - *Consequence:* real stages, and only counts that exist. No fake percentages.
