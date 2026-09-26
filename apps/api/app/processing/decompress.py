"""Safe zstd decompression with bomb limits."""

from __future__ import annotations

import logging
from pathlib import Path

import zstandard as zstd

logger = logging.getLogger(__name__)

ZSTD_MAGIC = b"\x28\xb5\x2f\xfd"
PBDEMS2_MAGIC = b"PBDEMS2\x00"


class DecompressError(Exception):
    """User-facing decompress failure."""


def is_zstd(path: Path) -> bool:
    with path.open("rb") as f:
        return f.read(4) == ZSTD_MAGIC


def decompress_demo(
    src: Path,
    dest: Path,
    *,
    max_output_bytes: int,
) -> int:
    """Decompress .dem.zst → .dem. Returns bytes written."""
    if src.suffix.lower() == ".dem" and not str(src).lower().endswith(".dem.zst"):
        # Plain .dem — copy with size check
        size = src.stat().st_size
        if size > max_output_bytes:
            raise DecompressError("Demo file is too large to process.")
        dest.write_bytes(src.read_bytes())
        _validate_dem_magic(dest)
        return size

    if not is_zstd(src):
        raise DecompressError("That file is not valid zstd-compressed demo data.")

    dctx = zstd.ZstdDecompressor()
    written = 0
    dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        with src.open("rb") as fin, dest.open("wb") as fout, dctx.stream_reader(fin) as reader:
            while True:
                chunk = reader.read(8 * 1024 * 1024)
                if not chunk:
                    break
                written += len(chunk)
                if written > max_output_bytes:
                    fout.close()
                    dest.unlink(missing_ok=True)
                    raise DecompressError("Decompressed demo exceeded the size limit.")
                fout.write(chunk)
    except DecompressError:
        raise
    except zstd.ZstdError as exc:
        dest.unlink(missing_ok=True)
        logger.exception("zstd failed for %s", src)
        raise DecompressError("Could not decompress that demo.") from exc
    except OSError as exc:
        dest.unlink(missing_ok=True)
        logger.exception("IO during decompress %s", src)
        raise DecompressError("Could not write the decompressed demo.") from exc

    _validate_dem_magic(dest)
    return written


def _validate_dem_magic(path: Path) -> None:
    with path.open("rb") as f:
        head = f.read(8)
    if head != PBDEMS2_MAGIC:
        path.unlink(missing_ok=True)
        raise DecompressError(
            "Decompressed file is not a CS2 demo (expected PBDEMS2). CS:GO demos are not supported yet."
        )
