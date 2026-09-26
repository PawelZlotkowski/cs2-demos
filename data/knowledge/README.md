# Coach knowledge base (T30)

Markdown the coach searches with the `search_knowledge` tool (plan §7, T30–T32). It is indexed by `python -m app.rag.index` from `apps/api` (`app/rag/ingest.py`), and the index also rebuilds itself when these files change.

## Layout

```
data/knowledge/
  de_mirage/     callouts, t-side, ct-side, utility, rotations
  de_anubis/     same topics
  general/       fundamentals (one section per detector topic)
  liquipedia/    fetched pages, CC BY-SA 3.0 (commit only after review, see below)
  SOURCES.md     every source with licence and attribution
```

## Format

Each file starts with flat front matter (not full YAML: `key: value` lines, no quotes or lists, `#` starts a comment), then one passage per `##` heading:

```markdown
---
map: de_mirage        # de_mirage | de_anubis | all
side: any             # T | CT | any
topic: callouts
source: own notes     # or Liquipedia: <page URL>
license: CC-BY-4.0
lang: en
review: draft         # draft until a player has checked it in-game
---

## Palace

Zones: Palace.
Three to six sentences about one idea...
```

- The ingest reads `map`, `side`, `topic` and `source`; the other keys are for people and the content test.
- Text before the first `##` is not indexed. `###` stays inside its passage. Keep a passage to one idea and under about 150 words.
- The first line of a passage names its zones (`Zones: …`, exactly as in `apps/api/app/maps/zones/*.json`) or detectors (`Detectors: …`, the `Finding.detector` values). This helps BM25 match a finding to the right notes.
- Write in English. The coach answers in en, pl or nl; bge-m3 embeddings are multilingual.
- Passage ids (`K1`, `K2`, …) follow the sorted file path and heading order, so adding a file renumbers them. Citations are resolved per run.
- The coach may quote a number only from a passage it cited, so check every number you write.
- No exact grenade lineups: they change with patches and belong in-game.

## Counts

`pytest tests/knowledge` (in `apps/api`) checks the front matter, the zone and detector names and the minimum of 40 sections per map.

| Map | Sections |
|---|---|
| Mirage | 58 |
| Anubis | 49 |
| General | 25 |

## Review status

Everything here is a first draft written from general CS2 knowledge, not checked in-game. Before relying on it in evaluation, a player should read each map file, fix callouts that differ from how the team talks, and set `review: checked`. The Stairs section on Mirage notes a likely error in the draft zone polygon.

## Liquipedia

Liquipedia text is CC BY-SA 3.0. `fetch_liquipedia.py` downloads the map pages into `liquipedia/` with attribution front matter, split by heading. The cloud sessions cannot reach liquipedia.net, so run it locally:

```bash
python data/knowledge/fetch_liquipedia.py Mirage Anubis   # --force to refresh
```

It follows the Liquipedia API terms: a User-Agent with the repo URL (set `LIQUIPEDIA_CONTACT` to add an email), gzip, one parse request per 30 seconds, and no re-download of pages already in `liquipedia/`. Read the output before committing: keep only sections that help coaching and leave the attribution in place. Because of share-alike, a derived dataset that includes these sections (for example fine-tuning data, T50) must carry the same licence.
