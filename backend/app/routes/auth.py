import base64
import hashlib
import hmac

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from ..auth import COOKIE_NAME, hash_auth_token, issue_token, require_user, verify_auth_token
from ..config import Settings, get_settings
from ..db import get_db
from ..models import User
from ..rate_limit import client_ip, login_limiter, prelogin_limiter, register_limiter
from ..schemas import (
    LoginRequest,
    LoginResponse,
    MeResponse,
    PreloginResponse,
    RegisterRequest,
)

router = APIRouter(prefix="/auth", tags=["auth"])

# Defaults advertised on prelogin for unregistered emails. They also serve as
# the "what we expect new clients to use" recommendation.
DEFAULT_KDF_ALGORITHM = "argon2id"
DEFAULT_KDF_PARAMS = {"m": 65536, "t": 3, "p": 1}  # 64 MiB, 3 iters, parallelism 1


def _dummy_salt(email: str, s: Settings) -> str:
    """Stable per-email pseudo-salt used when the email isn't registered.
    Keeps prelogin responses indistinguishable so attackers can't enumerate."""
    mac = hmac.new(s.email_enum_pepper.encode(), email.lower().encode(), hashlib.sha256).digest()[:16]
    return base64.b64encode(mac).decode()


def _set_session_cookie(response: Response, user_id: str, s: Settings) -> None:
    token = issue_token(user_id, s)
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        secure=s.cookie_secure,
        samesite="lax",
        max_age=s.jwt_expires_minutes * 60,
        path="/",
    )


@router.get("/prelogin", response_model=PreloginResponse)
def prelogin(email: str, request: Request, db: Session = Depends(get_db), s: Settings = Depends(get_settings)):
    prelogin_limiter.check(client_ip(request))
    user = db.query(User).filter(User.email == email.lower()).first()
    if user:
        return PreloginResponse(
            kdf_salt=user.kdf_salt,
            kdf_algorithm=user.kdf_algorithm,
            kdf_params=user.kdf_params,
        )
    return PreloginResponse(
        kdf_salt=_dummy_salt(email, s),
        kdf_algorithm=DEFAULT_KDF_ALGORITHM,
        kdf_params=DEFAULT_KDF_PARAMS,
    )


@router.post("/register")
def register(
    body: RegisterRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    s: Settings = Depends(get_settings),
):
    register_limiter.check(client_ip(request))
    email = body.email.lower()
    if db.query(User).filter(User.email == email).first() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "email already registered")

    user = User(
        email=email,
        auth_hash=hash_auth_token(body.auth_token),
        kdf_salt=body.kdf_salt,
        kdf_algorithm=body.kdf_algorithm,
        kdf_params=body.kdf_params,
        wrapped_vault_key=body.wrapped_vault_key,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    _set_session_cookie(response, user.id, s)
    return {"ok": True, "user_id": user.id}


@router.post("/login", response_model=LoginResponse)
def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    s: Settings = Depends(get_settings),
):
    login_limiter.check(client_ip(request))
    user = db.query(User).filter(User.email == body.email.lower()).first()
    if user is None or not verify_auth_token(body.auth_token, user.auth_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid credentials")

    _set_session_cookie(response, user.id, s)
    return LoginResponse(user_id=user.id, email=user.email, wrapped_vault_key=user.wrapped_vault_key)


@router.post("/logout")
def logout(response: Response, s: Settings = Depends(get_settings)):
    response.delete_cookie(COOKIE_NAME, path="/", secure=s.cookie_secure, samesite="lax")
    return {"ok": True}


@router.get("/me", response_model=MeResponse)
def me(user: User = Depends(require_user)):
    return MeResponse(user_id=user.id, email=user.email)
