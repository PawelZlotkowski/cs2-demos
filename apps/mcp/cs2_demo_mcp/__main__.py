"""Run the cs2-demo MCP server.

    python -m cs2_demo_mcp                      # stdio (MCP inspector, local clients)
    python -m cs2_demo_mcp --transport http     # streamable HTTP on 127.0.0.1:8765/mcp

It reads the same data as the API (``RR_DATA_DIR``, default ``apps/api/data``),
so matches uploaded through the web app are visible to any MCP client.
"""

from __future__ import annotations

import argparse
import ipaddress
import logging
import sys


def _is_allowed_http_host(host: str) -> bool:
    """Allow only literal loopback addresses or the localhost name.

    Do not resolve arbitrary names here: DNS rebinding or a proxy header must
    never turn an externally reachable bind into a trusted local MCP server.
    """
    if host.casefold() == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="cs2-demo-mcp", description=__doc__.splitlines()[0])
    parser.add_argument("--transport", choices=["stdio", "http"], default="stdio")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args(argv)

    # stdout carries the protocol on stdio; logs go to stderr
    logging.basicConfig(level=logging.INFO, stream=sys.stderr)

    if args.transport == "http":
        # HTTP MCP exposes the same repository-backed tools as the API but has
        # no per-owner authentication. Keep it local until that boundary is
        # implemented; stdio remains the trusted local-operator transport.
        from app.core.config import settings

        if settings.access_mode == "authenticated":
            parser.error(
                "HTTP MCP is unavailable with RR_ACCESS_MODE=authenticated; "
                "per-owner MCP authentication is not implemented. Use stdio "
                "or keep HTTP in local mode on loopback."
            )
        if not _is_allowed_http_host(args.host):
            parser.error("HTTP MCP may bind only to localhost or a literal loopback IP address.")

    from app.coach.mcp_server import build_server

    server = build_server()
    if args.transport == "stdio":
        server.run("stdio")
    else:
        server.run("streamable-http", host=args.host, port=args.port)


if __name__ == "__main__":
    main()
