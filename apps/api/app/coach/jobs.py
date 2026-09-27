"""Coach jobs (AI Coach plan §6.2, T25–T27): moment selection, explanations, Ask.

Every job ends in something the verifier accepted or in a code fallback:

- selection: model picks → ``select_moments`` tool (verifies and stores) →
  one repair → else the code ranker's moments stay.
- explanation (moment or on-demand round): tool loop → ``verify_text`` →
  one repair → else the finding templates in the requested language.
- Ask: same as explanation with 1–3 sentences; progress is reported per tool
  step, and the answer is sent only once verified (never a claim that is
  withdrawn afterwards).

The jobs are async (the MCP client is async); ``run_sync`` runs one from a
worker thread or a sync endpoint.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Any, TypeVar

from app.analysis.ranker import MIN_EACH, MIN_MOMENTS, TARGET, rank_moments
from app.coach.agent import AgentRun, CoachAgent, StepCallback, TraceWriter, run_record
from app.coach.backends import InProcessTools, MCPTools
from app.coach.llm_client import LLM, LLMClient, LLMError, json_schema_format
from app.coach.prompts import load_prompt
from app.coach.tools import MomentPick
from app.coach.verify import (
    LANGUAGE_NAMES,
    VerifyContext,
    autocite,
    citations_in,
    fallback_text,
    verify_text,
)
from app.core.config import settings
from app.models.contracts import AskRequest, Finding, MomentExplanation, SelectedMoment

logger = logging.getLogger(__name__)

T = TypeVar("T")

# Candidates shown to the selection model (plan §6.2: top ~40 by severity)
MAX_CANDIDATES = 40
MIN_GOOD_CANDIDATES = 12
# Extra prompt rules per answer language (first live run, 26 Sep: weak Polish)
LANGUAGE_NOTES = {
    "en": "",
    "pl": (
        "\n- Polish: write correct Polish grammar with the right case endings (dobrej wymiany, szybkiej śmierci)."
        "\n- Polish: avoid gendered past-tense verbs (zginąłeś/zginęłaś); use noun phrases such as"
        " 'śmierć od P5' or 'twoja śmierć'. A player killed in the game 'ginie', never 'umiera' or 'zmarł'."
    ),
    "nl": "\n- Dutch: address the player as 'je', and keep callout names in English.",
}

EXPLAIN_TOOLS = {
    "get_finding",
    "list_findings",
    "get_round_stats",
    "get_round_timeline",
    "get_player_state",
    "get_player_history",
    "get_match_totals",
    "search_knowledge",
}


def run_sync(coro: Awaitable[T]) -> T:
    """Run a job from sync code (worker threads, sync FastAPI routes)."""
    return asyncio.run(coro)  # type: ignore[arg-type]


@dataclass
class SelectionOutcome:
    moments: list[SelectedMoment]
    source: str  # agent | ranker
    errors: list[str] = field(default_factory=list)


@dataclass
class AskOutcome:
    answer: str
    citations: list[str]
    source: str  # agent | template
    errors: list[str] = field(default_factory=list)


class CoachJobs:
    def __init__(
        self,
        repo: Any,
        llm: LLM | None = None,
        tools_factory: Callable[[], Any] | None = None,
        traces: TraceWriter | None = None,
        max_steps: int | None = None,
    ) -> None:
        self.repo = repo
        self.llm = llm or LLMClient()
        self.tools_factory = tools_factory or default_tools_factory
        self.traces = traces if traces is not None else TraceWriter(settings.resolved_traces_dir())
        self.max_steps = max_steps or settings.coach_max_steps

    @asynccontextmanager
    async def _agent(self) -> AsyncIterator[CoachAgent]:
        async with self.tools_factory() as tools:
            yield CoachAgent(self.llm, tools, max_steps=self.max_steps)

    def _trace(self, record: dict[str, Any]) -> None:
        try:
            self.traces.write(record)
        except OSError:
            logger.exception("Could not write coach trace")

    # --- helpers -------------------------------------------------------------

    def _player_name(self, match_id: str, player_id: str) -> str:
        record = self.repo.get(match_id) or {}
        for p in (record.get("match") or {}).get("players") or []:
            if p["id"] == player_id:
                return p["name"]
        return player_id

    def _map(self, match_id: str) -> str:
        record = self.repo.get(match_id) or {}
        match = record.get("match") or {}
        return match.get("mapName") or match.get("map") or "unknown map"

    def _round_durations(self, match_id: str) -> dict[int, float]:
        record = self.repo.get(match_id) or {}
        return {int(r["number"]): float(r.get("durationSec") or 0) for r in record.get("rounds") or []}

    def _verify_context(self, match_id: str, player_id: str, extra: set[float] | None = None) -> VerifyContext:
        a = self.repo.analysis
        return VerifyContext.build(
            a.findings(match_id, player_id),
            a.round_stats(match_id, player_id),
            a.moments(match_id, player_id),
            self._round_durations(match_id),
            extra,
        )

    # --- T25 moment selection ----------------------------------------------------

    async def select_moments(self, match_id: str, player_id: str) -> SelectionOutcome:
        a = self.repo.analysis
        findings = a.findings(match_id, player_id)
        prompt = load_prompt("select_moments")
        # Scarce findings allow fewer moments; the ranker's count is what fits the rules
        need = max(1, min(MIN_MOMENTS, len(rank_moments(findings))))
        system = prompt.render(min_moments=need, max_moments=max(need, TARGET), min_each=MIN_EACH)
        user = self._selection_table(match_id, player_id, findings)
        messages: list[dict[str, Any]] = [{"role": "system", "content": system}, {"role": "user", "content": user}]
        schema = {
            "type": "object",
            "properties": {
                "moments": {
                    "type": "array",
                    "items": MomentPick.model_json_schema(),
                    "minItems": 1,
                    "maxItems": TARGET,
                }
            },
            "required": ["moments"],
        }
        record: dict[str, Any] = {
            "job": "select_moments",
            "matchId": match_id,
            "playerId": player_id,
            "model": getattr(self.llm, "model", "unknown"),
            "promptVersion": prompt.version,
            "thinking": True,
            "candidates": user.count("\nF"),
            "attempts": [],
        }
        errors: list[str] = []
        try:
            async with self.tools_factory() as tools:
                record["toolsBackend"] = tools.kind
                for attempt in range(2):
                    result = await asyncio.to_thread(
                        lambda: self.llm.chat(
                            messages,
                            response_format=json_schema_format("moments", schema),
                            thinking=True,
                        )
                    )
                    messages.append(result.assistant_message())
                    picks = parse_json_object(result.content)
                    if picks is None or not isinstance(picks.get("moments"), list):
                        errors = ["Answer with a JSON object {\"moments\": [...]}."]
                    else:
                        stored = json.loads(
                            await tools.call(
                                "select_moments",
                                {"match_id": match_id, "player_id": player_id, "moments": picks["moments"]},
                            )
                        )
                        errors = stored.get("errors") or ([stored["error"]] if "error" in stored else [])
                    record["attempts"].append(
                        {"output": result.content, "reasoningChars": len(result.reasoning or ""), "errors": errors,
                         "latencyS": round(result.latency_s, 3), "usage": result.usage}
                    )
                    if not errors:
                        moments = a.moments(match_id, player_id)
                        record.update(source="agent", ok=True)
                        self._trace(record)
                        return SelectionOutcome(moments, "agent")
                    if attempt == 0:
                        messages.append({"role": "user", "content": repair_message(errors, json_only=True)})
        except LLMError as exc:
            errors = [str(exc)]
            logger.warning("Moment selection fell back to the ranker: %s", exc)
        record.update(source="ranker", ok=False, errors=errors)
        self._trace(record)
        return SelectionOutcome(a.moments(match_id, player_id), "ranker", errors)

    def _selection_table(self, match_id: str, player_id: str, findings: list[Finding]) -> str:
        good = sorted((f for f in findings if f.kind == "good"), key=lambda f: -f.severity)
        rest = sorted((f for f in findings if f.kind != "good"), key=lambda f: -f.severity)
        n_good = min(len(good), max(MIN_GOOD_CANDIDATES, MAX_CANDIDATES - len(rest)))
        chosen = good[:n_good] + rest[: MAX_CANDIDATES - n_good]
        chosen.sort(key=lambda f: (f.round, f.t))
        lines = [
            f"Match on {self._map(match_id)}. Coached player: {self._player_name(match_id, player_id)}.",
            f"{len(chosen)} of {len(findings)} findings (highest severity first, then kept in round order):",
            "",
            "id | kind | detector | round | t | zone | severity | summary",
        ]
        for f in chosen:
            lines.append(
                f"{f.id} | {f.kind} | {f.detector} | {f.round} | {f.t:.1f} | {f.zone or '-'} | {f.severity:.2f} | {f.summary}"
            )
        stats = self.repo.analysis.round_stats(match_id, player_id)
        if stats:
            lines += ["", "Rounds (round side result K/D damage):"]
            lines.append(
                ", ".join(
                    f"{s.round} {s.side.value if s.side else '?'} {'W' if s.won else 'L' if s.won is False else '-'} "
                    f"{s.kills}/{s.deaths} {s.damage}"
                    for s in stats
                )
            )
        return "\n".join(lines)

    # --- T26 explanations ------------------------------------------------------

    async def explain(
        self, match_id: str, player_id: str, target: str, lang: str, *, store: bool = True
    ) -> MomentExplanation:
        """Analysis text for a moment ("m3") or any round ("r12")."""
        a = self.repo.analysis
        all_findings = a.findings(match_id, player_id)
        by_id = {f.id: f for f in all_findings}
        if target.startswith("m"):
            moment = next((m for m in a.moments(match_id, player_id) if m.id == target), None)
            if moment is None:
                raise KeyError(target)
            findings = [by_id[i] for i in moment.finding_ids if i in by_id]
            round_no = moment.round
            focus = (
                f"Explain moment {moment.id}: round {moment.round}, {moment.t0:.1f}-{moment.t1:.1f} s "
                f"on the round clock, a {moment.kind}. Picked because: {moment.picked_because}"
            )
        else:
            round_no = int(target.lstrip("r"))
            findings = [f for f in all_findings if f.round == round_no]
            focus = f"Explain round {round_no} for the player: the most useful mistake or good play in it."
        prompt = load_prompt("explain_moment")
        record: dict[str, Any] = {
            "job": "explain",
            "matchId": match_id,
            "playerId": player_id,
            "target": target,
            "lang": lang,
        }

        if not findings or not self.llm_enabled():
            text = fallback_text(findings, lang)
            expl = MomentExplanation(
                target=target, lang=lang, text=text, citations=citations_in(text),
                finding_ids=[f.id for f in findings], source="template",
                verifier_errors=[] if findings else ["No findings in this round."],
            )
            if store:
                a.save_explanation(match_id, player_id, expl)
            return expl

        system = prompt.render(
            language=LANGUAGE_NAMES[lang], sentences="2 to 4", language_notes=LANGUAGE_NOTES[lang]
        )
        user = "\n".join(
            [
                self._context_line(match_id, player_id, round_no),
                focus,
                "",
                "Findings (evidence holds the numbers you may quote):",
                *(_finding_json(f) for f in findings),
                "",
                f"Write the explanation in {LANGUAGE_NAMES[lang]}.",
            ]
        )
        ctx = self._verify_context(match_id, player_id)
        outcome = await self._answer(
            job="explain",
            prompt_version=prompt.version,
            system=system,
            user=user,
            bound={"match_id": match_id, "player_id": player_id},
            ctx=ctx,
            lang=lang,
            max_sentences=4,
            require_citation=True,
            fallback=lambda: fallback_text(findings, lang),
            record=record,
            cite_candidates=[f.id for f in findings],
        )
        expl = MomentExplanation(
            target=target,
            lang=lang,
            text=outcome.answer,
            citations=outcome.citations,
            finding_ids=[c for c in outcome.citations if c.startswith("F")] or [f.id for f in findings],
            source=outcome.source,  # type: ignore[arg-type]
            verifier_errors=outcome.errors,
            model=getattr(self.llm, "model", None),
            prompt_version=prompt.version,
        )
        if store:
            a.save_explanation(match_id, player_id, expl)
        return expl

    async def explain_all_moments(self, match_id: str, player_id: str, lang: str) -> list[MomentExplanation]:
        return [
            await self.explain(match_id, player_id, m.id, lang)
            for m in self.repo.analysis.moments(match_id, player_id)
        ]

    # --- T27 Ask ------------------------------------------------------------------

    async def ask(
        self, match_id: str, player_id: str, req: AskRequest, on_step: StepCallback | None = None
    ) -> AskOutcome:
        a = self.repo.analysis
        prompt = load_prompt("answer_question")
        moment = None
        if req.moment_id:
            moment = next((m for m in a.moments(match_id, player_id) if m.id == req.moment_id), None)
        round_no = req.round or (moment.round if moment else None)
        all_findings = a.findings(match_id, player_id)
        in_view = (
            [f for f in all_findings if f.id in moment.finding_ids]
            if moment
            else [f for f in all_findings if round_no is not None and f.round == round_no]
        )
        extra = {float(n) for n in re.findall(r"\d+(?:\.\d+)?", req.question)}
        if round_no is not None:
            extra.add(float(round_no))
        if req.t is not None:
            extra.update({round(req.t, 1), float(round(req.t))})
        record: dict[str, Any] = {
            "job": "ask",
            "matchId": match_id,
            "playerId": player_id,
            "lang": req.language,
            "question": req.question,
            "round": round_no,
            "momentId": req.moment_id,
        }

        def fallback() -> str:
            if in_view:
                return fallback_text(in_view, req.language, limit=2)
            return {
                "en": "The coach model is not available, and there is no finding in view to answer from.",
                "pl": "Model trenera jest niedostępny i nie ma tu ustalenia, na którym można oprzeć odpowiedź.",
                "nl": "Het coachmodel is niet beschikbaar en er is hier geen bevinding om op te antwoorden.",
            }[req.language]

        if not self.llm_enabled():
            text = fallback()
            return AskOutcome(text, citations_in(text), "template", ["Coach model disabled."])

        context = self._context_line(match_id, player_id, round_no, t=req.t, moment=moment, view=req.view)
        lines = [context]
        if in_view:
            lines += ["Findings in view:", *(_finding_row(f) for f in in_view)]
        lines += ["", f"Question: {req.question}", f"Answer in {LANGUAGE_NAMES[req.language]}."]
        return await self._answer(
            job="ask",
            prompt_version=prompt.version,
            system=prompt.render(language=LANGUAGE_NAMES[req.language], language_notes=LANGUAGE_NOTES[req.language]),
            user="\n".join(lines),
            bound={"match_id": match_id, "player_id": player_id},
            ctx=self._verify_context(match_id, player_id, extra),
            lang=req.language,
            max_sentences=3,
            require_citation=False,
            fallback=fallback,
            record=record,
            on_step=on_step,
            cite_candidates=[f.id for f in in_view],
        )

    # --- shared: tool loop → verify → one repair → fallback ----------------------------

    async def _answer(
        self,
        *,
        job: str,
        prompt_version: str,
        system: str,
        user: str,
        bound: dict[str, Any],
        ctx: VerifyContext,
        lang: str,
        max_sentences: int,
        require_citation: bool,
        fallback: Callable[[], str],
        record: dict[str, Any],
        on_step: StepCallback | None = None,
        cite_candidates: list[str] | None = None,
    ) -> AskOutcome:
        cite_candidates = cite_candidates or []
        messages: list[dict[str, Any]] = [{"role": "system", "content": system}, {"role": "user", "content": user}]
        runs: list[AgentRun] = []
        errors: list[str] = []
        try:
            async with self._agent() as agent:
                for attempt in range(2):
                    run = await agent.run(
                        job=job,
                        prompt_version=prompt_version,
                        messages=messages,
                        bound=bound,
                        thinking=False,
                        allow_tools=EXPLAIN_TOOLS,
                        max_steps=None if attempt == 0 else 2,
                        on_step=on_step,
                    )
                    runs.append(run)
                    # Passages the model looked up may be cited as [K..]
                    ctx.knowledge.update(knowledge_in(run.messages))
                    # History counts (owner decision, 26 Sep) and match totals may be quoted
                    ctx.summary_numbers.update(summary_numbers_in(run.messages))
                    text = autocite(run.text, ctx, cite_candidates)
                    check = verify_text(
                        text, ctx, lang, require_citation=require_citation, max_sentences=max_sentences
                    )
                    errors = check.errors
                    if check.ok:
                        verdict = {"ok": True, "errors": [], "autocited": text != run.text.strip()}
                        self._trace({**record, **_runs_record(runs), "verifier": verdict, "source": "agent"})
                        return AskOutcome(text, check.citations, "agent")
                    messages = run.messages + [{"role": "user", "content": repair_message(errors)}]
        except LLMError as exc:
            errors = [str(exc)]
            logger.warning("%s fell back to templates: %s", job, exc)
        text = fallback()
        self._trace({**record, **_runs_record(runs), "verifier": {"ok": False, "errors": errors}, "source": "template", "fallback": text})
        return AskOutcome(text, citations_in(text), "template", errors)

    def _context_line(
        self,
        match_id: str,
        player_id: str,
        round_no: int | None,
        *,
        t: float | None = None,
        moment: SelectedMoment | None = None,
        view: Any = None,
    ) -> str:
        parts = [f"Match on {self._map(match_id)}.", f"Coached player: {self._player_name(match_id, player_id)}."]
        if round_no is not None:
            parts.append(f"Round {round_no}" + (f" at [t:{t:.1f}]." if t is not None else "."))
        if moment is not None:
            parts.append(f"Moment {moment.id} with findings {', '.join(moment.finding_ids)}.")
        if view is not None:
            parts.append(f"View: {getattr(view, 'value', view)}.")
        return " ".join(parts)

    def llm_enabled(self) -> bool:
        return settings.llm_enabled or not isinstance(self.llm, LLMClient)


# --- module helpers --------------------------------------------------------------


def default_tools_factory() -> Any:
    if settings.coach_tools == "inprocess":
        return InProcessTools()
    return MCPTools.from_settings(settings.mcp_url, settings.mcp_command)


def knowledge_in(messages: list[dict[str, Any]]) -> dict[str, str]:
    """``search_knowledge`` passages returned in a run: id -> text."""
    found: dict[str, str] = {}
    for m in messages:
        if m.get("role") != "tool" or '"passages"' not in (m.get("content") or ""):
            continue
        try:
            body = json.loads(m["content"])
        except json.JSONDecodeError:
            continue
        for p in body.get("passages") or []:
            if isinstance(p, dict) and isinstance(p.get("id"), str):
                found[p["id"]] = str(p.get("text") or "")
    return found


def summary_numbers_in(messages: list[dict[str, Any]]) -> set[float]:
    """Numbers in ``get_player_history`` and ``get_match_totals`` results returned in a run."""
    found: set[float] = set()

    def walk(v: Any) -> None:
        if isinstance(v, bool):
            return
        if isinstance(v, int | float):
            found.add(float(v))
        elif isinstance(v, dict):
            for x in v.values():
                walk(x)
        elif isinstance(v, list):
            for x in v:
                walk(x)

    for m in messages:
        content = m.get("content") or ""
        if m.get("role") != "tool" or ('"per10Rounds"' not in content and '"matchTotals"' not in content):
            continue
        try:
            walk(json.loads(content))
        except json.JSONDecodeError:
            continue
    return found


def repair_message(errors: list[str], *, json_only: bool = False) -> str:
    listed = "\n".join(f"- {e}" for e in errors[:10])
    tail = "Return the corrected JSON only." if json_only else "Rewrite the answer so it passes every check. Answer with the text only."
    return f"Your answer failed these checks:\n{listed}\n{tail}"


def parse_json_object(text: str) -> dict[str, Any] | None:
    """The first JSON object in the text (tolerates code fences and stray prose)."""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text)
    start = text.find("{")
    while start >= 0:
        try:
            obj, _ = json.JSONDecoder().raw_decode(text[start:])
            if isinstance(obj, dict):
                return obj
        except json.JSONDecodeError:
            pass
        start = text.find("{", start + 1)
    return None


def _finding_row(f: Finding) -> str:
    return f"{f.id} {f.kind} {f.detector} round {f.round} t={f.t:.1f} {f.zone or '-'}: {f.summary}"


def _finding_json(f: Finding) -> str:
    return json.dumps(
        {"id": f.id, "kind": f.kind, "detector": f.detector, "round": f.round, "t": round(f.t, 1),
         "zone": f.zone, "evidence": f.evidence, "summary": f.summary},
        ensure_ascii=False,
        separators=(",", ":"),
    )


def _runs_record(runs: list[AgentRun]) -> dict[str, Any]:
    if not runs:
        return {"runs": []}
    last = runs[-1]
    return {
        "model": last.model,
        "promptVersion": last.prompt_version,
        "toolsBackend": last.tools_backend,
        "repaired": len(runs) > 1,
        "latencyS": round(sum(r.latency_s for r in runs), 3),
        "runs": [run_record(r) for r in runs],
    }
