"""Code ranker: 5–6 moments from findings (severity x diversity).

The fallback for the LLM moment selection (plan §6.2) and the moments shown
until that agent exists.

1. Group each player's findings into candidate moments: same round, within
   ``GROUP_WINDOW_S`` of each other. Only ``mistake`` and ``good`` findings
   start a moment; ``context`` and ``pattern`` findings join a nearby one.
2. Score = highest severity + 0.05 per extra finding in the group.
3. Greedy pick: each pick's score is multiplied by ``DIVERSITY`` for every
   earlier pick led by the same detector; no two picks within
   ``MIN_GAP_S`` in the same round; reserve slots so at least ``MIN_EACH``
   mistakes and ``MIN_EACH`` good plays are picked when they exist.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.models.contracts import Finding, SelectedMoment

TARGET = 6
MIN_MOMENTS = 5
MIN_EACH = 3  # with TARGET 6: three mistakes and three good plays whenever both exist
GROUP_WINDOW_S = 6.0
MAX_GROUP_SPAN_S = 20.0  # With lead/tail padding, stays below the 30 s agent limit.
MIN_GAP_S = 10.0
DIVERSITY = 0.7
MAX_SAME = 2  # at most two moments of one type while other types are left


def moment_type(f: Finding) -> str:
    """What a moment is about: the detector, or the play for good_plays (clutch, multi_kill, ...)."""
    return f.template if f.detector == "good_plays" else f.detector
LEAD_S = 5.0  # seconds shown before the first finding
TAIL_S = 3.0  # seconds shown after the last finding


@dataclass
class _Candidate:
    round: int
    findings: list[Finding]
    kind: str
    score: float
    picked_score: float = 0.0  # score after the diversity penalty, when picked

    @property
    def lead(self) -> Finding:
        return max((f for f in self.findings if f.kind == self.kind), key=lambda f: f.severity)

    @property
    def t_mid(self) -> float:
        return self.lead.t

    @property
    def window(self) -> tuple[float, float]:
        return (max(0.0, min(f.t for f in self.findings) - LEAD_S),
                max(f.t for f in self.findings) + TAIL_S)


def _candidates(findings: list[Finding]) -> list[_Candidate]:
    out: list[_Candidate] = []
    by_round: dict[int, list[Finding]] = {}
    for f in findings:
        by_round.setdefault(f.round, []).append(f)
    for rnd, fs in sorted(by_round.items()):
        fs = sorted(fs, key=lambda f: f.t)
        groups: list[list[Finding]] = []
        for f in fs:
            if (groups and f.t - groups[-1][-1].t <= GROUP_WINDOW_S
                    and f.t - groups[-1][0].t <= MAX_GROUP_SPAN_S):
                groups[-1].append(f)
            else:
                groups.append([f])
        for g in groups:
            for kind in ("mistake", "good"):
                leaders = [f for f in g if f.kind == kind]
                if not leaders:
                    continue
                score = max(f.severity for f in leaders) + 0.05 * (len(g) - 1)
                out.append(_Candidate(round=rnd, findings=g, kind=kind, score=round(score, 3)))
    return out


def rank_moments(findings: list[Finding], target: int = TARGET) -> list[SelectedMoment]:
    if target <= 0:
        return []
    cands = _candidates(findings)
    picked: list[_Candidate] = []
    used_detectors: dict[tuple[str, str], int] = {}

    def effective(c: _Candidate) -> float:
        return c.score * (DIVERSITY ** used_detectors.get((c.kind, moment_type(c.lead)), 0))

    def clashes(c: _Candidate) -> bool:
        ids = {f.id for f in c.findings}
        return any(p.round == c.round and (
            abs(p.t_mid - c.t_mid) < MIN_GAP_S
            or ids.intersection(f.id for f in p.findings)
            or max(p.window[0], c.window[0]) < min(p.window[1], c.window[1])
        ) for p in picked)

    def pick_best(pool: list[_Candidate]) -> bool:
        if len(picked) >= target:
            return False
        options = [c for c in pool if c not in picked and not clashes(c)]
        if not options:
            return False
        fresh = [c for c in options if used_detectors.get((c.kind, moment_type(c.lead)), 0) < MAX_SAME]
        best = max(fresh or options, key=lambda c: (effective(c), -c.round, -c.t_mid))
        best.picked_score = effective(best)
        picked.append(best)
        key = (best.kind, moment_type(best.lead))
        used_detectors[key] = used_detectors.get(key, 0) + 1
        return True

    for kind in ("mistake", "good"):
        for _ in range(MIN_EACH):
            if not pick_best([c for c in cands if c.kind == kind]):
                break
    while len(picked) < target and pick_best(cands):
        pass

    picked.sort(key=lambda c: (c.round, c.t_mid))
    moments: list[SelectedMoment] = []
    for i, c in enumerate(picked, start=1):
        t0 = max(0.0, min(f.t for f in c.findings) - LEAD_S)
        t1 = max(f.t for f in c.findings) + TAIL_S
        ids = [c.lead.id] + [f.id for f in c.findings if f.id != c.lead.id]
        moments.append(
            SelectedMoment(
                id=f"m{i}",
                round=c.round,
                t0=round(t0, 2),
                t1=round(t1, 2),
                finding_ids=ids,
                kind=c.kind,  # type: ignore[arg-type]
                picked_because=f"[{c.lead.id}] {c.lead.summary}",
                score=round(c.picked_score, 3),
                source="ranker",
            )
        )
    return moments
