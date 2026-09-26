# 09 AI Coach

Related: [05 Analysis Studio](./05-ANALYSIS-STUDIO.md), [10 Personalisation](./10-PERSONALIZATION.md), [16 Data contracts](./16-DATA-CONTRACTS.md)

Code: `ask()`, `renderSugg()`, `updateKnows()`, `stream()`, `cites()` and `homeAsk()` in [`prototype/analysis-studio.html`](../../prototype/analysis-studio.html).

**Status: mocked.** Answers are scripted per moment (`qa`). Anything not in the script gets a fallback answer built from the moment's first finding, which says the prototype only has scripted answers. The words appear two at a time to imitate server-sent-event (SSE) streaming.

## What it is

The Coach is a contextual query layer on the current moment, not a chatbot:

- It lives in the panel's **Ask** tab, next to the **Analysis** tab ([19](./19-DECISIONS.md) #20).
- On Home there is a history-scoped version ("Ask about recent matches").
- There is no standalone page, no floating button, no avatar and no chat bubbles.

## Context it already has

The Coach is shown as a single line ("Knows round 3 at 1:15, the gameplay view, findings F4 and F5 and your last 7 matches."). It updates live as the user scrubs or switches view.

| Context | Source in the prototype |
|---|---|
| Match | `MATCH` |
| Round, moment, key time | `M.round`, `M.key`, `M.clockStart` |
| Current timestamp | `S.t` |
| Current view | `S.mode` |
| Findings | `M.ev` IDs |
| History | `M.pattern`, `LAST7` |

- **Planned backend:** the payload must include all of this plus the finding records themselves. Its shape is sketched in [16](./16-DATA-CONTRACTS.md#coach-context).
- **Planned agent (owner decision, 26 Sep 2026; supersedes the earlier hosted-model idea):** a tool-calling loop over the `cs2-demo` MCP server, running only self-hosted models:
  - Qwen3-14B Q4_K_M on llama.cpp (RTX 5080), thinking off for Ask answers
  - a larger open model on an RTX Pro 6000 later, and a QLoRA fine-tuned 14B
  - RAG over map knowledge (`[K..]` citations) and the player's past findings
  - a code verifier that checks every claim against a finding ID and every number against its evidence
  - answers in English, Polish or Dutch

  Details: [AI Coach plan](../coach/AI-COACH-PLAN.md) §5–§7.

## Suggested questions

There are three per moment. They are short and specific to the moment, and they disappear once asked:

- "Why was this peek risky?"
- "Was this rotation too early?"
- "Compare with previous matches"
- "Where should the flash have gone?"
- "How could I have known the AWP was there?"

Never write generic prompts such as "Tell me more about this moment".

The input placeholder is contextual too: "Ask about round 3 at 1:15".

## Answer requirements

- Reference actual data, and cite **finding IDs** for every factual claim.
- Link to what can be opened. These tokens are rendered by `cites()`:

| Token | Renders as | Action |
|---|---|---|
| `[F12]` | `F12` | Seeks to the finding's time |
| `[t:4.6]` | The round clock, e.g. `0:48` | Seeks to that clip time |
| `[m6]` | "moment 6, crossed Mid in the AWP's line" | Opens that moment |
| `[K7]` | Source name of knowledge passage 7 (planned) | Shows the passage and its source |

- Previous matches are named in plain text (for example "Mirage, Fri 18 Sep"). There is no link, because other matches are not loaded in the prototype. Linking them is planned.
- Keep answers short: one to three sentences, with no preamble and no closing offer.
- Say when the data can't support a claim (for example "too early to call it a strength").

## Layout of a thread

- The question is shown in bold UI type, and the answer in the serif (the Coach's voice).
- Question-and-answer pairs are separated by a hairline, and the thread scrolls.
- **Analysis** returns to the insight. Esc does the same.

## Voice

- Direct, specific and in the second person: "You left 3.1 s after the first footsteps."
- British spelling, no em dashes, no hype.
- Never greet, never ask "How can I help you today?", and never use filler such as "Great question".
