"""Minimal dependency-free password hashing and HS256 JWT helpers.

The password format uses hashlib.scrypt with a per-password random salt. JWTs are
signed with HMAC-SHA256 and intentionally contain only identity/tenant claims.
"""

import base64
from datetime import UTC, datetime, timedelta
import hashlib
import hmac
import json
import os
from typing import Any

from app.core.config import settings


def _b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode()


def _b64decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return f"scrypt$16384$8$1${_b64encode(salt)}${_b64encode(digest)}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, n, r, p, salt, expected = encoded.split("$")
        if algorithm != "scrypt":
            return False
        actual = hashlib.scrypt(
            password.encode(), salt=_b64decode(salt), n=int(n), r=int(r), p=int(p)
        )
        return hmac.compare_digest(actual, _b64decode(expected))
    except (ValueError, TypeError):
        return False


def create_access_token(
    subject: str, client_id: str, *, expires_delta: timedelta | None = None
) -> str:
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": subject,
        "client_id": client_id,
        "iat": int(now.timestamp()),
        "exp": int(
            (now + (expires_delta or timedelta(minutes=settings.access_token_expire_minutes))).timestamp()
        ),
        "type": "access",
    }
    header = {"alg": settings.jwt_algorithm, "typ": "JWT"}
    encoded_header = _b64encode(json.dumps(header, separators=(",", ":")).encode())
    encoded_payload = _b64encode(json.dumps(payload, separators=(",", ":")).encode())
    message = f"{encoded_header}.{encoded_payload}"
    signature = hmac.new(settings.jwt_secret_key.encode(), message.encode(), hashlib.sha256).digest()
    return f"{message}.{_b64encode(signature)}"


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        encoded_header, encoded_payload, encoded_signature = token.split(".")
        message = f"{encoded_header}.{encoded_payload}"
        expected = hmac.new(
            settings.jwt_secret_key.encode(), message.encode(), hashlib.sha256
        ).digest()
        if not hmac.compare_digest(expected, _b64decode(encoded_signature)):
            raise ValueError("Invalid token signature")
        header = json.loads(_b64decode(encoded_header))
        payload = json.loads(_b64decode(encoded_payload))
        if header.get("alg") != settings.jwt_algorithm:
            raise ValueError("Invalid token algorithm")
        if payload.get("type") != "access" or int(payload.get("exp", 0)) < int(datetime.now(UTC).timestamp()):
            raise ValueError("Token has expired")
        return payload
    except (ValueError, TypeError, json.JSONDecodeError) as exc:
        raise ValueError("Invalid access token") from exc
