from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def _uuid() -> str:
    return uuid.uuid4().hex


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)

    # Argon2 hash of the auth_token the client derives from the password.
    # Server never sees the raw password.
    auth_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    # KDF parameters the client used. Re-served on prelogin so the client
    # can reproduce wrap_key and auth_token from the password.
    kdf_salt: Mapped[str] = mapped_column(String(64), nullable=False)       # base64
    kdf_algorithm: Mapped[str] = mapped_column(String(32), nullable=False)  # e.g. "argon2id"
    kdf_params: Mapped[dict] = mapped_column(JSON, nullable=False)          # e.g. {"m":65536,"t":3,"p":1}

    # User's vault key (32 random bytes), wrapped with the client-derived
    # wrap_key via AES-256-GCM. Format: base64(nonce(12) || ciphertext+tag).
    wrapped_vault_key: Mapped[str] = mapped_column(String, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)

    nodes: Mapped[list["Node"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class Node(Base):
    """A folder or a file. Self-referential tree, rooted per user."""
    __tablename__ = "nodes"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    parent_id: Mapped[str | None] = mapped_column(String(32), ForeignKey("nodes.id", ondelete="CASCADE"), nullable=True)

    kind: Mapped[str] = mapped_column(String(8), nullable=False)  # "folder" | "file"

    # Name encrypted client-side with the user's vault_key (AES-256-GCM).
    # Server stores opaque base64.
    name_ciphertext: Mapped[str] = mapped_column(String, nullable=False)
    name_nonce: Mapped[str] = mapped_column(String(32), nullable=False)  # base64 12B

    # --- file-only columns (NULL for folders) ---
    # Per-file AES-256 data key, wrapped with the user's vault_key.
    wrapped_data_key: Mapped[str | None] = mapped_column(String, nullable=True)
    file_nonce: Mapped[str | None] = mapped_column(String(32), nullable=True)  # base64 12B
    size: Mapped[int | None] = mapped_column(Integer, nullable=True)  # ciphertext size

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)
    trashed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[User] = relationship(back_populates="nodes")
    parent: Mapped["Node | None"] = relationship(remote_side="Node.id", back_populates="children")
    children: Mapped[list["Node"]] = relationship(back_populates="parent", cascade="all, delete-orphan")


Index("ix_nodes_user_parent_trashed", Node.user_id, Node.parent_id, Node.trashed_at)
Index("ix_nodes_user_trashed", Node.user_id, Node.trashed_at)
