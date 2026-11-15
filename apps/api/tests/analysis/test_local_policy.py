from app.analysis.run import detect_findings
from app.core.config import settings
from tests.analysis.builders import kill, match, round_, shot


def test_local_policy_keeps_evidence_but_does_not_call_speculative_detectors(monkeypatch):
    from app.analysis.detectors import DETECTORS

    def unexpected(*args):
        raise AssertionError('Local V1 must not infer visibility, intent or unvalidated zones')

    for name in ('dry_peek', 'late_rotation', 'economy_mismatch', 'repeated_death_zone'):
        monkeypatch.setitem(DETECTORS, name, unexpected)
    monkeypatch.setattr(settings, 'analysis_profile', 'local-v1')
    rd = round_(shots=[shot(10, 't1', 180)], kills=[kill(12, 'ct1', 't1')])
    findings = detect_findings(match(rd), 't1')
    assert any(f.detector == 'shot_while_moving' for f in findings)
    assert any(f.detector == 'untraded_death' for f in findings)
