"""Argon2id password hashes (doc 27 §1). Parameters: argon2-cffi's RFC 9106 low-memory profile."""

from __future__ import annotations

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from argon2.profiles import RFC_9106_LOW_MEMORY

_hasher = PasswordHasher.from_parameters(RFC_9106_LOW_MEMORY)
# Checked against when the username is unknown, so both paths take the same time
_DUMMY = _hasher.hash("not-a-real-password")

MIN_LENGTH = 10


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    try:
        return _hasher.verify(password_hash or _DUMMY, password) and password_hash is not None
    except (VerificationError, InvalidHashError):
        return False


def password_problem(password: str, username: str | None = None) -> str | None:
    if len(password) < MIN_LENGTH:
        return f"Use at least {MIN_LENGTH} characters."
    if len(password) > 256:
        return "Use at most 256 characters."
    if username and password.lower() == username.lower():
        return "The password cannot be the username."
    return None
