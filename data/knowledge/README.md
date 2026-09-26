# Coach knowledge base (T30)

Markdown the RAG index (`apps/api/app/rag/`, T31) reads for the `search_knowledge` tool (T32). Plan: [AI-COACH-PLAN §7](../../docs/coach/AI-COACH-PLAN.md).

## Layout

```
data/knowledge/
  de_mirage/     callouts, t-side, ct-side, utility, rotations
  de_anubis/     same topics
  general/       fundamentals (one section per detector topic)
  liquipedia/    fetched pages, CC BY-SA (not committed until reviewed, see below)
  SOURCES.md     every source with licence and attribution
```

## Format

- One file per topic. YAML frontmatter with `map` (`de_mirage`, `de_anubis` or `any`), `side` (`t`, `ct`, `both`), `topic`, `source`, `license`, `lang`, `review` (`draft` until a player has checked it).
- One retrieval chunk per `##` section. Keep a section to one idea and under about 150 words.
- The first line of a section says which zones (`Zones: …`, names exactly as in `apps/api/app/maps/zones/*.json`) or detectors (`Detectors: …`, the `Finding.detector` values) it is about. The ingest can use these as filters; they also help BM25.
- Notes are written in English. The embedding model (bge-m3) is multilingual, so Polish and Dutch questions still match; the coach answers in the user's language.
- No exact grenade lineups: they change with patches and belong in-game.

## Counts

`pytest apps/api/tests/knowledge` checks the frontmatter, the zone and detector names and the minimum of 40 sections per map.

| Map | Sections |
|---|---|
| Mirage | 58 |
| Anubis | 49 |
| General | 25 |

## Review status

Everything here is a first draft written from general CS2 knowledge, not checked in-game. Before relying on it in evaluation, a player should read each map file, fix callouts that differ from how the team talks, and set `review: checked`. The Stairs section on Mirage notes a likely error in the draft zone polygon.

## Liquipedia

Liquipedia text is CC BY-SA 3.0. `fetch_liquipedia.py` downloads the map pages into `liquipedia/` with attribution frontmatter, split by heading. The cloud sessions could not reach liquipedia.net, so run it locally:

```bash
python data/knowledge/fetch_liquipedia.py Mirage Anubis
```

It keeps to Liquipedia's API rules (a descriptive User-Agent, one parse request per 30 seconds). Read the output before committing: keep only sections that help coaching and leave the attribution frontmatter in place. Because of share-alike, a derived dataset that includes these sections (for example fine-tuning data, T50) must carry the same licence.
