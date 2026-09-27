# cs2-demo MCP server

The coach tools from [`apps/api/app/coach/tools.py`](../api/app/coach/tools.py) served over the
Model Context Protocol (AI Coach plan §5, task T21). The server holds no logic of its own: each
tool is registered from the same function the in-process adapter calls.

## Install and run

```bash
cd apps/api && pip install -e ".[dev]"   # the tools and their data access
pip install -e ../mcp

python -m cs2_demo_mcp                    # stdio
python -m cs2_demo_mcp --transport http   # streamable HTTP at http://127.0.0.1:8765/mcp
```

Set `RR_DATA_DIR` to the API's data folder if you run it from somewhere else; it reads the same
`matches.db` and match folders as the API.

Check it with the MCP inspector:

```bash
npx @modelcontextprotocol/inspector python -m cs2_demo_mcp
```

## What it serves

| Tool | Returns |
|---|---|
| `list_rounds(match_id, player_id)` | side, result, score, K/D/damage per round |
| `get_round_stats(match_id, player_id, round)` | `RoundStats` for one round |
| `get_match_totals(match_id, player_id)` | whole-match totals: rounds, kills, deaths, damage, ADR, utility, openings, trades |
| `list_findings(match_id, player_id, round?, kind?, detector?)` | findings: id, kind, detector, round, t, zone, severity, summary |
| `get_finding(match_id, player_id, finding_id)` | one finding with its evidence |
| `get_round_timeline(match_id, round)` | kills, grenades, plant/defuse with round clock times and callouts |
| `get_player_state(match_id, round, t)` | every player's side, callout, health at time t |
| `get_player_history(player_id, detector?, match_id?)` | detector rates across the player's earlier matches (`match_id` is left out) |
| `list_matches(player_id, map?)` | the player's analysed matches as `M1`, `M2`, … with map, date, score and counts (Coach page) |
| `find_moments(player_id, detector?, kind?, zone?, map?, limit?)` | findings across those matches, cited as `M2:F3` |
| `select_moments(match_id, player_id, moments)` | validates and stores 5–6 picked moments |
| `search_knowledge(query, map?, k?)` | top map-note passages as `K..` ids with title, source and text |
| `request_clip(match_id, player_id, round, t0, t1)` | queues a POV clip of up to 60 s for the CS Demo Manager recorder |

Resource `match://{match_id}/overview`. Prompts `select_moments`, `explain_moment(language)`,
`answer_question(language)`.

## Connect another app

Settings, Connect another app in the web app lists the same commands. For Open WebUI, run the HTTP
transport and add `http://127.0.0.1:8765/mcp` as an MCP server. For LM Studio, add the stdio command
to its `mcp.json` with `RR_DATA_DIR` in `env`. The server binds to 127.0.0.1 and has no auth yet.

## How the coach uses it

The API's coach agent is an MCP client of this server (`RR_COACH_TOOLS=mcp`, the default). With
no other setting it runs the server in-process, still over the MCP protocol. Point it at a
running server with `RR_MCP_URL=http://127.0.0.1:8765/mcp` or have it spawn one over stdio with
`RR_MCP_COMMAND="python -m cs2_demo_mcp"`. `RR_COACH_TOOLS=inprocess` skips MCP (tests and the
latency comparison in the evaluation).
