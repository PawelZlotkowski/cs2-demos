import pytest

from app.processing import parse_demo


def test_malformed_message_has_actionable_error_without_claiming_a_cause(monkeypatch):
    def fail(path):
        raise RuntimeError('MalformedMessage')

    monkeypatch.setattr(parse_demo, 'DemoParser', fail)
    with pytest.raises(parse_demo.ParseError, match='MalformedMessage') as error:
        parse_demo.parse_demo_file('already-decompressed.dem')
    assert 'decompressed automatically' in str(error.value)
    assert 'damaged file or an unsupported demo format' in str(error.value)
