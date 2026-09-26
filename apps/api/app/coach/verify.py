"""Verifier for everything the model writes (AI Coach plan §6.3).

Code decides what happened; this module checks that the model's text only
says what the code found:

- citations: every ``[F..]``, ``[m..]``, ``[K..]`` token exists for this match
  and player; ``[t:..]`` lies inside the round.
- numbers: every number in the text matches a value in the cited findings'
  evidence, their round stats, a cited time, or the question's context
  (tolerance: the precision the number is written with, and 2 %).
- facts carry citations: a sentence with a number or a callout must cite.
- language: the answer is in the requested language (a stopword score; swap
  for lingua/fastText if the evaluation shows it misfires).

Moment picks get their own check (``verify_moments``). On failure the jobs
make one repair attempt with the error list, then fall back to templates
(``fallback_text``).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from app.analysis.ranker import MIN_EACH, MIN_GAP_S, MIN_MOMENTS, TARGET, rank_moments
from app.coach.templates import render
from app.models.contracts import Finding, RoundStats, SelectedMoment

CITATION_RE = re.compile(r"\[((?:F\d+|m\d+|K\d+|t:\d+(?:\.\d+)?)(?:\s*,\s*(?:F\d+|m\d+|K\d+|t:\d+(?:\.\d+)?))*)\]")
# A number not glued to a word before it (AK-47, M4A1 and F12 are not numbers)
NUMBER_RE = re.compile(r"(?<![A-Za-z0-9_\-.,:])(\d{1,3}(?:[ .,]\d{3})+(?![\d])|\d+(?:[.,]\d+)?)")
CLOCK_RE = re.compile(r"(?<![\d:])(\d{1,2}):(\d{2})(?![\d:])")
SENTENCE_RE = re.compile(r"(?<=[.!?])\s+(?=[A-ZĄĆĘŁŃÓŚŹŻ\"'(\[])")

MAX_WINDOW_S = 30.0


@dataclass
class VerifyContext:
    """What the text may refer to."""

    findings: dict[str, Finding]
    round_stats: dict[int, RoundStats] = field(default_factory=dict)
    moment_ids: set[str] = field(default_factory=set)
    knowledge_ids: set[str] = field(default_factory=set)  # RAG passages (T32)
    round_durations: dict[int, float] = field(default_factory=dict)
    # Numbers the user or the Studio context supplied (question text, round, t)
    extra_numbers: set[float] = field(default_factory=set)
    zones: set[str] = field(default_factory=set)

    @classmethod
    def build(
        cls,
        findings: list[Finding],
        round_stats: list[RoundStats] | None = None,
        moments: list[SelectedMoment] | None = None,
        round_durations: dict[int, float] | None = None,
        extra_numbers: set[float] | None = None,
    ) -> VerifyContext:
        return cls(
            findings={f.id: f for f in findings},
            round_stats={s.round: s for s in round_stats or []},
            moment_ids={m.id for m in moments or []},
            round_durations=dict(round_durations or {}),
            extra_numbers=set(extra_numbers or set()),
            zones={f.zone for f in findings if f.zone},
        )


@dataclass
class TextCheck:
    ok: bool
    errors: list[str]
    citations: list[str]
    finding_ids: list[str]


def citations_in(text: str) -> list[str]:
    out: list[str] = []
    for group in CITATION_RE.findall(text):
        for token in re.split(r"\s*,\s*", group):
            if token not in out:
                out.append(token)
    return out


def verify_text(
    text: str,
    ctx: VerifyContext,
    lang: str,
    *,
    require_citation: bool = True,
    max_sentences: int | None = None,
) -> TextCheck:
    errors: list[str] = []
    text = text.strip()
    if not text:
        return TextCheck(False, ["The answer is empty."], [], [])

    cites = citations_in(text)
    finding_ids = [c for c in cites if c.startswith("F")]
    for c in cites:
        if c.startswith("F") and c not in ctx.findings:
            errors.append(f"[{c}] is not a finding of this player in this match.")
        elif c.startswith("m") and c not in ctx.moment_ids:
            errors.append(f"[{c}] is not one of the selected moments.")
        elif c.startswith("K") and c not in ctx.knowledge_ids:
            errors.append(f"[{c}] is not a knowledge passage returned by a tool.")
        elif c.startswith("t:"):
            t = float(c[2:])
            longest = max(ctx.round_durations.values(), default=None)
            if longest is not None and t > longest + 1:
                errors.append(f"[{c}] is later than the end of the round.")
    if require_citation and not finding_ids:
        errors.append("Cite at least one finding, e.g. [F12].")

    allowed = _allowed_numbers(ctx, [c for c in finding_ids if c in ctx.findings], cites)
    plain = CITATION_RE.sub(" ", text)
    for mm, ss in CLOCK_RE.findall(plain):
        seconds = int(mm) * 60 + int(ss)
        if not any(abs(seconds - v) <= 1 for v in allowed):
            errors.append(f"The time {mm}:{ss} does not match any cited time; cite times as [t:..].")
    plain_no_clock = CLOCK_RE.sub(" ", plain)
    for raw in NUMBER_RE.findall(plain_no_clock):
        value, tol = _parse_number(raw)
        if not any(abs(value - v) <= max(tol, 0.02 * abs(v)) for v in allowed):
            errors.append(f"The number {raw} is not in the cited findings or round stats.")

    sentences = [s for s in SENTENCE_RE.split(text) if s.strip()]
    if max_sentences is not None and len(sentences) > max_sentences:
        errors.append(f"Use at most {max_sentences} sentences (found {len(sentences)}).")
    for s in sentences:
        body = CITATION_RE.sub(" ", s)
        states_fact = bool(NUMBER_RE.search(CLOCK_RE.sub(" ", body))) or any(z in body for z in ctx.zones)
        if states_fact and not CITATION_RE.search(s):
            errors.append(f"This sentence states a fact without a citation: {s.strip()[:80]!r}.")

    detected = detect_language(plain)
    if detected is not None and detected != lang:
        errors.append(f"Write in {LANGUAGE_NAMES[lang]}; the answer reads as {LANGUAGE_NAMES[detected]}.")

    # De-duplicate, keep order
    errors = list(dict.fromkeys(errors))
    return TextCheck(not errors, errors, cites, finding_ids)


def _parse_number(raw: str) -> tuple[float, float]:
    """Value and rounding tolerance. '4,700' and '4 700' are thousands; '1,5' is 1.5."""
    if re.fullmatch(r"\d{1,3}(?:[ .,]\d{3})+", raw):
        return float(re.sub(r"[ .,]", "", raw)), 0.5
    s = raw.replace(",", ".")
    decimals = len(s.split(".")[1]) if "." in s else 0
    return float(s), 0.5 * 10 ** (-decimals) + 1e-9


def _numbers_in(value: Any) -> list[float]:
    if isinstance(value, bool):
        return []
    if isinstance(value, (int, float)):
        return [float(value)]
    if isinstance(value, str):
        return [_parse_number(n)[0] for n in NUMBER_RE.findall(value)]
    return []


def _allowed_numbers(ctx: VerifyContext, finding_ids: list[str], cites: list[str]) -> list[float]:
    allowed: set[float] = set(ctx.extra_numbers)
    rounds: set[int] = set()
    for fid in finding_ids:
        f = ctx.findings[fid]
        rounds.add(f.round)
        allowed.update({float(f.round), round(f.t, 1), float(round(f.t))})
        for v in f.evidence.values():
            allowed.update(_numbers_in(v))
    for rnd in rounds:
        stats = ctx.round_stats.get(rnd)
        if stats:
            for v in stats.model_dump().values():
                allowed.update(_numbers_in(v))
    for c in cites:
        if c.startswith("t:"):
            allowed.add(float(c[2:]))
        elif c.startswith("m"):
            allowed.add(float(c[1:]))
    return sorted(allowed)


# --- language ------------------------------------------------------------

LANGUAGE_NAMES = {"en": "English", "pl": "Polish", "nl": "Dutch"}

_STOPWORDS = {
    "en": set(
        "the you your and to of a an in was were with for on that it not is at after before "
        "when this from had have no nobody could would should there their they by".split()
    ),
    "pl": set(
        "i w z na się nie to że do po jest był była było bez od przy ale jak za co twój twoja "
        "twoje ci cię tylko już gdy kiedy ten ta tym tej przez nikt żaden możesz".split()
    ),
    "nl": set(
        "het een van je niet de dat is op met voor zijn naar bij geen ook maar als er te wat "
        "jij jouw was waren werd door na nog toen hebt heeft kon zonder".split()
    ),
}
_POLISH_CHARS = set("ąćęłńśźż")


def detect_language(text: str) -> str | None:
    """Best guess among en/pl/nl, or None when the text is too short to tell."""
    words = re.findall(r"[a-ząćęłńóśźż']+", text.lower())
    if len(words) < 4:
        return None
    scores = {lang: sum(1 for w in words if w in sw) for lang, sw in _STOPWORDS.items()}
    scores["pl"] += 2 * sum(1 for ch in text.lower() if ch in _POLISH_CHARS)
    best = max(scores, key=lambda k: scores[k])
    ranked = sorted(scores.values(), reverse=True)
    if ranked[0] < 2 or ranked[0] == ranked[1]:
        return None
    return best


# --- moment picks ----------------------------------------------------------


@dataclass
class MomentCheck:
    ok: bool
    errors: list[str]
    moments: list[SelectedMoment]


def verify_moments(picks: list[dict[str, Any]], findings: list[Finding]) -> MomentCheck:
    by_id = {f.id: f for f in findings}
    errors: list[str] = []
    moments: list[SelectedMoment] = []

    # What is achievable: the code ranker's picks respect the same gap rule,
    # so their count and mix are the bar when findings are scarce.
    feasible = rank_moments(findings)
    lead_kinds = {k: sum(1 for m in feasible if m.kind == k) for k in ("mistake", "good")}
    need = min(MIN_MOMENTS, len(feasible))
    if len(picks) < need or len(picks) > TARGET:
        errors.append(f"Pick {need}-{TARGET} moments; got {len(picks)}.")

    placed: list[tuple[int, float, int]] = []
    kinds = {"mistake": 0, "good": 0}
    for i, p in enumerate(picks, start=1):
        label = f"Moment {i}"
        try:
            rnd = int(p["round"])
            t0, t1 = float(p["t0"]), float(p["t1"])
            ids = [str(x) for x in p.get("findingIds") or p.get("finding_ids") or []]
            kind = str(p["kind"])
            because = str(p.get("pickedBecause") or p.get("picked_because") or "")
        except (KeyError, TypeError, ValueError):
            errors.append(f"{label}: needs round, t0, t1, findingIds, kind and pickedBecause.")
            continue
        if kind not in kinds:
            errors.append(f"{label}: kind must be mistake or good.")
            continue
        if not ids:
            errors.append(f"{label}: cite at least one finding.")
            continue
        unknown = [x for x in ids if x not in by_id]
        if unknown:
            errors.append(f"{label}: unknown findings {', '.join(unknown)}.")
            continue
        cited = [by_id[x] for x in ids]
        if any(f.round != rnd for f in cited):
            errors.append(f"{label}: all findings must be from round {rnd}.")
            continue
        if not (0 <= t0 < t1) or t1 - t0 > MAX_WINDOW_S:
            errors.append(f"{label}: window must satisfy 0 <= t0 < t1 and last at most {MAX_WINDOW_S:.0f} s.")
            continue
        outside = [f.id for f in cited if not (t0 - 0.5 <= f.t <= t1 + 0.5)]
        if outside:
            errors.append(f"{label}: findings {', '.join(outside)} are outside {t0}-{t1} s.")
            continue
        if not any(f.kind == kind for f in cited):
            errors.append(f"{label}: kind {kind} needs at least one {kind} finding.")
            continue
        if not any(c in ids for c in citations_in(because)):
            errors.append(f"{label}: pickedBecause must cite one of its findings, e.g. [{ids[0]}].")
            continue
        lead = min((f for f in cited if f.kind == kind), key=lambda f: -f.severity)
        for other_round, other_t, j in placed:
            if other_round == rnd and abs(other_t - lead.t) < MIN_GAP_S:
                errors.append(f"{label}: too close to moment {j} (same round, under {MIN_GAP_S:.0f} s apart).")
                break
        else:
            placed.append((rnd, lead.t, i))
            kinds[kind] += 1
            moments.append(
                SelectedMoment(
                    id="",
                    round=rnd,
                    t0=round(t0, 2),
                    t1=round(t1, 2),
                    finding_ids=ids,
                    kind=kind,  # type: ignore[arg-type]
                    picked_because=because.strip(),
                    score=round(max(f.severity for f in cited), 3),
                    source="agent",
                )
            )

    for kind, name in (("mistake", "mistakes"), ("good", "good plays")):
        want = min(MIN_EACH, lead_kinds[kind])
        if kinds[kind] < want:
            errors.append(f"Include at least {want} {name}; got {kinds[kind]}.")

    moments.sort(key=lambda m: (m.round, m.t0))
    moments = [m.model_copy(update={"id": f"m{i}"}) for i, m in enumerate(moments, start=1)]
    return MomentCheck(not errors, errors, moments)


# --- template fallback -------------------------------------------------------


def fallback_text(findings: list[Finding], lang: str, *, limit: int = 3) -> str:
    """Templated sentences with citations, in the requested language."""
    if not findings:
        return {
            "en": "No mistakes or good plays were detected in this round.",
            "pl": "W tej rundzie nie wykryto błędów ani dobrych zagrań.",
            "nl": "In deze ronde zijn geen fouten of goede acties gevonden.",
        }[lang]
    ranked = sorted(findings, key=lambda f: (f.kind not in ("mistake", "good"), -f.severity))[:limit]
    ranked.sort(key=lambda f: f.t)
    parts = []
    for f in ranked:
        sentence = render(f.template, lang, {**f.evidence, "zone": f.zone, "round": f.round}).rstrip()
        if sentence.endswith("."):
            sentence = sentence[:-1]
        parts.append(f"{sentence} [{f.id}].")
    return " ".join(parts)
