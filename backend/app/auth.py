from datetime import datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .config import Settings, get_settings
from .db import get_db
from .models import User

JWT_ALG = "HS256"
COOKIE_NAME = "vault_session"

_hasher = PasswordHasher()


def hash_auth_token(auth_token: str) -> str:
    """Argon2id over the high-entropy client-derived auth_token."""
    return _hasher.hash(auth_token)


def verify_auth_token(auth_token: str, stored_hash: str) -> bool:
    try:
        return _hasher.verify(stored_hash, auth_token)
    except (VerifyMismatchError, Exception):
        return False


def issue_token(user_id: str, s: Settings) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=s.jwt_expires_minutes)).timestamp()),
    }
    return jwt.encode(payload, s.jwt_secret, algorithm=JWT_ALG)


def decode_token(token: str, s: Settings) -> dict:
    return jwt.decode(token, s.jwt_secret, algorithms=[JWT_ALG])


def require_user(
    vault_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
    s: Settings = Depends(get_settings),
    db: Session = Depends(get_db),
) -> User:
    if not vault_session:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "not authenticated")
    try:
        payload = decode_token(vault_session, s)
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid session")
    user = db.get(User, payload.get("sub"))
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "user no longer exists")
    return user
