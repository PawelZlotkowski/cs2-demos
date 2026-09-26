# Coach knowledge base

Markdown the coach searches with the `search_knowledge` tool (AI Coach plan §7, task T30). It is indexed by `python -m app.rag.index` from `apps/api`, and the index also rebuilds itself when these files change.

## Format

One file per map or topic. Each file starts with front matter, then one passage per `##` heading:

```markdown
---
map: de_mirage        # de_mirage | de_anubis | all
side: any             # T | CT | any
topic: fundamentals
source: own notes     # or "Liquipedia: <page title>"
license:              # "CC BY-SA 4.0" for Liquipedia text, with the page URL in source
---

## Trading distance

Two or three sentences a coach can cite...
```

- Keep each passage short: three to six sentences about one idea.
- Callout names are in English, the same names as `apps/api/app/maps/zones/`.
- Write in English. The coach answers in en, pl or nl, but it searches in English.
- Passage ids (`K1`, `K2`, …) follow the file and heading order. They change when you add a section in the middle of a file, so traces keep the passage text as well as the id.
- The model may quote numbers from a passage it cites, so check every number you write.
- Copied text needs its source and licence. Liquipedia is CC BY-SA 4.0: put the page URL in `source`, and share any derivative under the same licence.

## Status

This is a starter set written on 26 Sep 2026 so the tool has something to search. It covers the general fundamentals and a few notes per map. T30 asks for at least 40 sections per map, written or checked by both students.
