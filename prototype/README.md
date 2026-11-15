# Studio references — design paused

Pawel paused design work on 20 October 2026. These files are references, not production application code.

- [Tactical Lens](tactical-lens-studio.html): saved, standalone preview of the latest selected concept. Replay movement and coach responses are simulated. Carbon/Cobalt, Graphite/Ice and Paper/Ultramarine remain exploratory palette options.
- [Editable fragment](source/tactical-lens-studio.fragment.html): exact source of that conversation prototype.
- [Original Studio](analysis-studio.html), `fixtures/` and `qa/`: existing implementation reference and checks. They are not the newly selected visual direction.
- [Match room](match-room.html), 25 October 2026: a FACEIT-style match room in our own style, built on a real parse (Anubis, 20 rounds). It covers team scoreboards with a transparent impact score, a round map with numbered killer-to-victim lines and live positions while scrubbing, a kills/utility feed linked to the map, a round strip (results or economy) and round highlights. Overview shows the whole-match table with an impact-by-round strip per player. Data comes from `fixtures/match-room.json`, written by `fixtures/extract_match_room.py <match-id>` from `apps/api/data/matches/<id>/`. Clipping is not wired; the button says what the app would queue.

  Run it from the repo root (the page fetches JSON, so `file://` does not work), then open http://127.0.0.1:8765/prototype/match-room.html:

  ```bash
  apps/api/.venv/Scripts/python.exe -m http.server 8765 --bind 127.0.0.1
  ```

  Impact per round = kills, opening and trade kills, assists, damage, plants and defuses, minus deaths (weights in the page's "How impact works"), then minus that round's lobby average, so 0 is an average round and the ten players sum to 0. It is an estimate for finding rounds worth reviewing, not a win-probability model. `?player=<name>` changes the coached player.

The floating desktop, rejected light/dark comparison, rejected explorations and three-way concept board were not imported. Their original files remain in their previous folders.

Do not port a prototype wholesale or resume design work during file consolidation. Any future implementation must use real replay/evidence contracts and truthful model/job states. The current UI research is in [the paused UI plan](../docs/planning/STUDIO-UI-AND-MOTION-PLAN.md).
