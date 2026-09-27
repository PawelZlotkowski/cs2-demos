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
MIN_EACH = 2
GROUP_WINDOW_S = 6.0
MIN_GAP_S = 10.0
DIVERSITY = 0.7
LEAD_S = 5.0  # seconds shown before the first finding
TAIL_S = 3.0  # seconds shown after the last finding


@dataclass
class _Candidate:
    round: int
    findings: list[Finding]
    kind: str
    score: float

    @property
    def lead(self) -> Finding:
        return max((f for f in self.findings if f.kind == self.kind), key=lambda f: f.severity)

    @property
    def t_mid(self) -> float:
        return self.lead.t


def _candidates(findings: list[Finding]) -> list[_Candidate]:
    out: list[_Candidate] = []
    by_round: dict[int, list[Finding]] = {}
    for f in findings:
        by_round.setdefault(f.round, []).append(f)
    for rnd, fs in sorted(by_round.items()):
        fs = sorted(fs, key=lambda f: f.t)
        groups: list[list[Finding]] = []
        for f in fs:
            if groups and f.t - groups[-1][-1].t <= GROUP_WINDOW_S:
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
    cands = _candidates(findings)
    picked: list[_Candidate] = []
    used_detectors: dict[str, int] = {}

    def effective(c: _Candidate) -> float:
        return c.score * (DIVERSITY ** used_detectors.get(c.lead.detector, 0))

    def clashes(c: _Candidate) -> bool:
        return any(p.round == c.round and abs(p.t_mid - c.t_mid) < MIN_GAP_S for p in picked)

    def pick_best(pool: list[_Candidate]) -> bool:
        options = [c for c in pool if c not in picked and not clashes(c)]
        if not options:
            return False
        best = max(options, key=lambda c: (effective(c), -c.round, -c.t_mid))
        picked.append(best)
        used_detectors[best.lead.detector] = used_detectors.get(best.lead.detector, 0) + 1
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
                score=round(effective(c), 3),
                source="ranker",
            )
        )
    return moments
