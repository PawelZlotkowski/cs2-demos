from app.analysis.run import detect_findings
from app.core.config import settings
from tests.analysis.builders import frames, hurt, kill, match, round_, shot, w


def test_fresh_api_defaults_to_delivery_profile(monkeypatch):
    from app.core.config import Settings
    monkeypatch.delenv('RR_ANALYSIS_PROFILE', raising=False)
    assert Settings(_env_file=None).analysis_profile == 'local-v1'
    assert Settings(_env_file=None, analysis_profile='all').analysis_profile == 'all'


def test_policy_version_names_the_detector_revision():
    from app.analysis.policy import policy_description
    assert policy_description('local-v1')['version'] == 'local-v1.2'
    assert policy_description('all')['version'] == 'legacy-all-v1.2'


def test_local_policy_keeps_evidence_but_does_not_call_speculative_detectors(monkeypatch):
    from app.analysis.detectors import DETECTORS

    def unexpected(*args):
        raise AssertionError('Local V1 must not infer visibility, intent or unvalidated zones')

    for name in ('dry_peek', 'late_rotation', 'economy_mismatch', 'repeated_death_zone'):
        monkeypatch.setitem(DETECTORS, name, unexpected)
    monkeypatch.setattr(settings, 'analysis_profile', 'local-v1')
    rd = round_(shots=[shot(10, 't1', 180), shot(10.1, 't1', 180)],
                hurts=[hurt(10.1, 'ct1', 't1', 20)], kills=[kill(12, 'ct1', 't2')],
                frames=frames({'t1': w('A site'), 't2': w('A site')}))
    findings = detect_findings(match(rd), 't1')
    assert any(f.detector == 'shot_while_moving' for f in findings)
    assert any(f.detector == 'untraded_death' for f in findings)

    assert all(f.kind == 'context' for f in findings if f.detector in {'shot_while_moving', 'untraded_death'})
