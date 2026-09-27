"""T21: the cs2-demo MCP server lists and serves every tool, in-process and over stdio."""

from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

from app.coach.backends import InProcessTools, MCPTools
from app.coach.mcp_server import build_server
from app.coach.tools import TOOLS
from app.core.config import settings
from app.repositories.matches import repo

MCP_DIR = Path(__file__).resolve().parents[3] / "mcp"


def sample_args(mid: str, pid: str) -> dict[str, dict]:
    first = repo.analysis.findings(mid, pid)[0].id
    return {
        "list_rounds": {"match_id": mid, "player_id": pid},
        "get_round_stats": {"match_id": mid, "player_id": pid, "round": 1},
        "get_match_totals": {"match_id": mid, "player_id": pid},
        "list_findings": {"match_id": mid, "player_id": pid, "round": 1},
        "get_finding": {"match_id": mid, "player_id": pid, "finding_id": first},
        "get_round_timeline": {"match_id": mid, "round": 1},
        "get_player_state": {"match_id": mid, "round": 1, "t": 12.0},
        "get_player_history": {"player_id": pid},
        "select_moments": {"match_id": mid, "player_id": pid, "moments": []},
        "search_knowledge": {"query": "trading a teammate", "k": 2},
        "request_clip": {"match_id": mid, "player_id": pid, "round": 1, "t0": 10.0, "t1": 18.0},
        "list_matches": {"player_id": pid},
        "find_moments": {"player_id": pid, "kind": "mistake", "limit": 5},
    }


async def call_every_tool(backend, mid: str, pid: str) -> dict[str, dict]:
    async with backend as tools:
        names = [t.name for t in await tools.list_tools()]
        assert sorted(names) == sorted(TOOLS)
        return {name: json.loads(await tools.call(name, args)) for name, args in sample_args(mid, pid).items()}


def test_mcp_and_inprocess_give_the_same_results(analysed):
    mid, pid = analysed
    via_mcp = asyncio.run(call_every_tool(MCPTools(build_server()), mid, pid))
    direct = asyncio.run(call_every_tool(InProcessTools(), mid, pid))
    assert via_mcp == direct
    assert via_mcp["list_rounds"]["rounds"][0]["round"] == 1
    assert via_mcp["select_moments"]["ok"] is False  # empty picks are rejected, not stored


def test_mcp_schemas_match_the_function_signatures(analysed):
    async def main():
        async with MCPTools(build_server()) as mcp_tools, InProcessTools() as local:
            remote = {t.name: t.parameters for t in await mcp_tools.list_tools()}
            here = {t.name: t.parameters for t in await local.list_tools()}
            for name in TOOLS:
                assert set(remote[name]["properties"]) == set(here[name]["properties"]), name
                assert set(remote[name].get("required", [])) == set(here[name].get("required", [])), name

    asyncio.run(main())


def test_resource_and_prompts(analysed):
    mid, pid = analysed
    from mcp import Client

    async def main():
        async with Client(build_server()) as client:
            templates = await client.list_resource_templates()
            assert [t.uri_template for t in templates.resource_templates] == ["match://{match_id}/overview"]
            res = await client.read_resource(f"match://{mid}/overview")
            overview = json.loads(res.contents[0].text)
            assert overview["selectedPlayerId"] == pid and overview["map"] == "de_mirage"
            prompts = {p.name for p in (await client.list_prompts()).prompts}
            assert prompts == {"select_moments", "explain_moment", "answer_question"}
            got = await client.get_prompt("explain_moment", {"language": "pl"})
            assert "Polish" in got.messages[0].content.text

    asyncio.run(main())


def test_stdio_server_subprocess(analysed, tmp_path):
    """The real transport: `python -m cs2_demo_mcp` over stdio, reading the same data."""
    mid, pid = analysed
    from mcp import StdioServerParameters

    env = {
        **os.environ,
        "PYTHONPATH": os.pathsep.join([str(MCP_DIR), str(Path(__file__).resolve().parents[2])]),
        "RR_DATA_DIR": str(Path(repo.analysis.db_path).parent),
        "RR_MATCHES_DIR": str(repo.matches_dir),
        "RR_UPLOAD_DIR": str(repo.upload_dir),
        "RR_FIXTURE_PATH": str(settings.resolved_fixture_path()),
        "RR_KNOWLEDGE_DIR": str(Path(__file__).resolve().parents[4] / "data" / "knowledge"),
    }
    params = StdioServerParameters(command=sys.executable, args=["-m", "cs2_demo_mcp"], env=env)
    out = asyncio.run(call_every_tool(MCPTools(params), mid, pid))
    assert out["get_round_timeline"]["events"][1]["e"] == "kill"
    assert out["get_player_history"]["matches"] == 1
