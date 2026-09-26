"""The ``cs2-demo`` MCP server (AI Coach plan §5, T21).

A thin wrapper: every tool in ``coach/tools.py`` is registered as is, so the
MCP schema comes from the same signature the in-process adapter uses. No
logic lives here. Run it with ``python -m cs2_demo_mcp`` (``apps/mcp/``) over
stdio or streamable HTTP; the coach agent connects to it as an MCP client.

Resource: ``match://{match_id}/overview``.
Prompts: ``select_moments``, ``explain_moment``, ``answer_question``.
"""

from __future__ import annotations

import json

from mcp.server.mcpserver import MCPServer

from app.coach import tools
from app.coach.prompts import load_prompt
from app.coach.verify import LANGUAGE_NAMES

INSTRUCTIONS = (
    "Tools over one parsed CS2 demo and the findings the detectors produced for one player. "
    "Cite findings as [F12] and round clock times as [t:34.5]. Every number you quote must "
    "come from a finding's evidence or the round stats."
)


def build_server() -> MCPServer:
    server = MCPServer("cs2-demo", instructions=INSTRUCTIONS, version="0.1.0")
    for name, fn in tools.TOOLS.items():
        server.add_tool(fn, name=name, structured_output=False)

    @server.resource("match://{match_id}/overview", mime_type="application/json")
    def match_overview(match_id: str) -> str:
        """Map, players, round count and the chosen player of a match."""
        try:
            return json.dumps(tools.match_overview(match_id))
        except tools.ToolError as exc:
            return json.dumps({"error": str(exc)})

    @server.prompt(name="select_moments")
    def select_moments_prompt() -> str:
        """System prompt for picking 5-6 moments from the findings."""
        return load_prompt("select_moments").render(min_moments=5, max_moments=6, min_each=2)

    @server.prompt(name="explain_moment")
    def explain_moment_prompt(language: str = "en") -> str:
        """System prompt for the Analysis text of one moment (language: en, pl or nl)."""
        return load_prompt("explain_moment").render(language=LANGUAGE_NAMES.get(language, "English"), sentences="2 to 4")

    @server.prompt(name="answer_question")
    def answer_question_prompt(language: str = "en") -> str:
        """System prompt for an Ask-tab answer (language: en, pl or nl)."""
        return load_prompt("answer_question").render(language=LANGUAGE_NAMES.get(language, "English"))

    return server
