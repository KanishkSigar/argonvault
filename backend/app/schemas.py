from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

# ============================================================================
# auth
# ============================================================================

class PreloginResponse(BaseModel):
    """Public KDF parameters the client needs before it can derive auth_token.
    For unknown emails we return a deterministic dummy salt + the current
    default algorithm/params so responses are indistinguishable from registered
    accounts."""
    kdf_salt: str                     # base64
    kdf_algorithm: str                # e.g. "argon2id"
    kdf_params: dict[str, int]        # e.g. {"m":65536,"t":3,"p":1}


class RegisterRequest(BaseModel):
    email: EmailStr
    auth_token: str = Field(..., min_length=32, max_length=128)        # base64
    kdf_salt: str = Field(..., min_length=16, max_length=64)           # base64
    kdf_algorithm: str = Field(..., min_length=3, max_length=32)
    kdf_params: dict[str, int]
    wrapped_vault_key: str = Field(..., min_length=32, max_length=256) # base64 (nonce||ct)


class LoginRequest(BaseModel):
    email: EmailStr
    auth_token: str = Field(..., min_length=32, max_length=128)


class LoginResponse(BaseModel):
    user_id: str
    email: EmailStr
    wrapped_vault_key: str   # base64 — client unwraps with derived wrap_key


class MeResponse(BaseModel):
    user_id: str
    email: EmailStr


# ============================================================================
# nodes
# ============================================================================

NodeKind = Literal["folder", "file"]


class CreateFolderRequest(BaseModel):
    parent_id: str | None = None
    name_ciphertext: str
    name_nonce: str


class InitUploadRequest(BaseModel):
    parent_id: str | None = None
    name_ciphertext: str
    name_nonce: str
    wrapped_data_key: str
    file_nonce: str


class InitUploadResponse(BaseModel):
    file_id: str
    upload_url: str
    upload_headers: dict[str, str]


class CompleteUploadRequest(BaseModel):
    file_id: str
    size: int


class NodeOut(BaseModel):
    id: str
    parent_id: str | None
    kind: NodeKind
    name_ciphertext: str
    name_nonce: str
    wrapped_data_key: str | None = None
    file_nonce: str | None = None
    size: int | None = None
    created_at: datetime
    trashed_at: datetime | None = None


class NodeListResponse(BaseModel):
    items: list[NodeOut]


class RenameRequest(BaseModel):
    name_ciphertext: str
    name_nonce: str


class MoveRequest(BaseModel):
    new_parent_id: str | None


class DownloadResponse(BaseModel):
    download_url: str
    wrapped_data_key: str
    file_nonce: str
