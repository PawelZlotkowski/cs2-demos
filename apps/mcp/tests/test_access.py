from __future__ import annotations

import pytest

from cs2_demo_mcp import __main__ as mcp_main


class ServerStub:
    def __init__(self) -> None:
        self.calls: list[tuple[tuple[object, ...], dict[str, object]]] = []

    def run(self, *args: object, **kwargs: object) -> None:
        self.calls.append((args, kwargs))


@pytest.fixture
def server_stub(monkeypatch: pytest.MonkeyPatch) -> ServerStub:
    server = ServerStub()
    monkeypatch.setattr("app.coach.mcp_server.build_server", lambda: server)
    return server


@pytest.mark.parametrize("host", ["127.0.0.1", "127.0.0.2", "::1", "localhost", "LOCALHOST"])
def test_http_accepts_only_explicit_loopback_hosts(host: str) -> None:
    assert mcp_main._is_allowed_http_host(host)


@pytest.mark.parametrize(
    "host",
    ["0.0.0.0", "::", "192.168.1.7", "example.com", "localhost.", "[::1]", " 127.0.0.1"],
)
def test_http_rejects_nonliteral_or_nonloopback_hosts(host: str) -> None:
    assert not mcp_main._is_allowed_http_host(host)


def test_http_runs_on_loopback_with_requested_port(
    monkeypatch: pytest.MonkeyPatch, server_stub: ServerStub
) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "access_mode", "local")

    mcp_main.main(["--transport", "http", "--host", "::1", "--port", "9001"])

    assert server_stub.calls == [(("streamable-http",), {"host": "::1", "port": 9001})]


@pytest.mark.parametrize("host", ["0.0.0.0", "192.168.1.7", "example.com"])
def test_http_rejects_external_bind_before_building_server(
    monkeypatch: pytest.MonkeyPatch, host: str
) -> None:
    from app.core.config import settings

    built = False

    def fail_if_built():
        nonlocal built
        built = True
        raise AssertionError("server construction must follow host validation")

    monkeypatch.setattr("app.coach.mcp_server.build_server", fail_if_built)
    monkeypatch.setattr(settings, "access_mode", "local")

    with pytest.raises(SystemExit) as exc:
        mcp_main.main(["--transport", "http", "--host", host])

    assert exc.value.code == 2
    assert not built


def test_authenticated_mode_fails_closed_before_building_http_server(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.core.config import settings

    built = False

    def fail_if_built():
        nonlocal built
        built = True
        raise AssertionError("authenticated HTTP must be rejected before server construction")

    monkeypatch.setattr("app.coach.mcp_server.build_server", fail_if_built)
    monkeypatch.setattr(settings, "access_mode", "authenticated")

    with pytest.raises(SystemExit) as exc:
        mcp_main.main(["--transport", "http", "--host", "127.0.0.1"])

    assert exc.value.code == 2
    assert not built


def test_stdio_remains_available_in_authenticated_mode(
    monkeypatch: pytest.MonkeyPatch, server_stub: ServerStub
) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "access_mode", "authenticated")

    mcp_main.main(["--transport", "stdio"])

    assert server_stub.calls == [(("stdio",), {})]
