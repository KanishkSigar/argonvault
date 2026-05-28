from datetime import datetime, timezone

from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import require_user
from ..config import Settings, get_settings
from ..db import get_db
from ..models import Node, User
from ..schemas import (
    CompleteUploadRequest,
    CreateFolderRequest,
    DownloadResponse,
    InitUploadRequest,
    InitUploadResponse,
    MoveRequest,
    NodeListResponse,
    NodeOut,
    RenameRequest,
)
from ..storage import get_s3

router = APIRouter(prefix="/nodes", tags=["nodes"])


def _to_out(n: Node) -> NodeOut:
    return NodeOut(
        id=n.id,
        parent_id=n.parent_id,
        kind=n.kind,
        name_ciphertext=n.name_ciphertext,
        name_nonce=n.name_nonce,
        wrapped_data_key=n.wrapped_data_key,
        file_nonce=n.file_nonce,
        size=n.size,
        created_at=n.created_at,
        trashed_at=n.trashed_at,
    )


def _get_node(db: Session, user: User, node_id: str) -> Node:
    n = db.get(Node, node_id)
    if n is None or n.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "node not found")
    return n


def _assert_folder_owned(db: Session, user: User, folder_id: str | None) -> None:
    if folder_id is None:
        return
    n = db.get(Node, folder_id)
    if n is None or n.user_id != user.id or n.kind != "folder" or n.trashed_at is not None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid parent folder")


# ---------- listing ----------

@router.get("", response_model=NodeListResponse)
def list_children(
    parent_id: str | None = Query(default=None),
    trash: bool = Query(default=False),
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    """If trash=true, returns all trashed nodes for the user (ignores parent_id).
    Otherwise returns the live children of `parent_id` (None = root)."""
    if trash:
        stmt = select(Node).where(Node.user_id == user.id, Node.trashed_at.is_not(None)).order_by(Node.trashed_at.desc())
    else:
        if parent_id is not None:
            _assert_folder_owned(db, user, parent_id)
        stmt = (
            select(Node)
            .where(
                Node.user_id == user.id,
                Node.parent_id == parent_id,
                Node.trashed_at.is_(None),
            )
            .order_by(Node.kind.desc(), Node.created_at.desc())  # folders first, newest first
        )
    items = [_to_out(n) for n in db.execute(stmt).scalars()]
    return NodeListResponse(items=items)


# ---------- folder ops ----------

@router.post("/folder", response_model=NodeOut, status_code=status.HTTP_201_CREATED)
def create_folder(
    body: CreateFolderRequest,
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    _assert_folder_owned(db, user, body.parent_id)
    n = Node(
        user_id=user.id,
        parent_id=body.parent_id,
        kind="folder",
        name_ciphertext=body.name_ciphertext,
        name_nonce=body.name_nonce,
    )
    db.add(n)
    db.commit()
    db.refresh(n)
    return _to_out(n)


# ---------- file upload handshake ----------

@router.post("/file/init-upload", response_model=InitUploadResponse)
def init_upload(
    body: InitUploadRequest,
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
    s: Settings = Depends(get_settings),
):
    """Create a file node + presign an S3 PUT. Browser already generated the
    data key and nonce and wrapped the data key with its vault_key."""
    _assert_folder_owned(db, user, body.parent_id)

    n = Node(
        user_id=user.id,
        parent_id=body.parent_id,
        kind="file",
        name_ciphertext=body.name_ciphertext,
        name_nonce=body.name_nonce,
        wrapped_data_key=body.wrapped_data_key,
        file_nonce=body.file_nonce,
        size=None,  # filled in on complete-upload
    )
    db.add(n)
    db.commit()
    db.refresh(n)

    try:
        upload_url = get_s3().generate_presigned_url(
            "put_object",
            Params={
                "Bucket": s.storage_bucket,
                "Key": n.id,
                "ContentType": "application/octet-stream",
            },
            ExpiresIn=s.presign_expires_seconds,
            HttpMethod="PUT",
        )
    except ClientError as e:
        # Roll back the node row so we don't leave dangling entries.
        db.delete(n)
        db.commit()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"presign error: {e}")

    return InitUploadResponse(
        file_id=n.id,
        upload_url=upload_url,
        upload_headers={"Content-Type": "application/octet-stream"},
    )


@router.post("/file/complete-upload")
def complete_upload(
    body: CompleteUploadRequest,
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    n = _get_node(db, user, body.file_id)
    if n.kind != "file":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "not a file")
    n.size = body.size
    db.commit()
    return {"ok": True}


# ---------- download ----------

@router.get("/{node_id}/download", response_model=DownloadResponse)
def download(
    node_id: str,
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
    s: Settings = Depends(get_settings),
):
    n = _get_node(db, user, node_id)
    if n.kind != "file":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "not a file")
    if n.wrapped_data_key is None or n.file_nonce is None or n.size is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "file upload not finalised")

    try:
        url = get_s3().generate_presigned_url(
            "get_object",
            Params={"Bucket": s.storage_bucket, "Key": n.id},
            ExpiresIn=s.presign_expires_seconds,
            HttpMethod="GET",
        )
    except ClientError as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"presign error: {e}")

    return DownloadResponse(
        download_url=url,
        wrapped_data_key=n.wrapped_data_key,
        file_nonce=n.file_nonce,
    )


# ---------- rename / move ----------

@router.patch("/{node_id}/rename", response_model=NodeOut)
def rename(
    node_id: str,
    body: RenameRequest,
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    n = _get_node(db, user, node_id)
    n.name_ciphertext = body.name_ciphertext
    n.name_nonce = body.name_nonce
    db.commit()
    db.refresh(n)
    return _to_out(n)


@router.patch("/{node_id}/move", response_model=NodeOut)
def move(
    node_id: str,
    body: MoveRequest,
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    n = _get_node(db, user, node_id)
    if body.new_parent_id == n.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "cannot move into self")
    _assert_folder_owned(db, user, body.new_parent_id)

    # Reject cycle: walk up from new_parent and make sure we don't hit `node_id`.
    cur = body.new_parent_id
    while cur is not None:
        if cur == n.id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "cannot move into own descendant")
        parent = db.get(Node, cur)
        cur = parent.parent_id if parent else None

    n.parent_id = body.new_parent_id
    db.commit()
    db.refresh(n)
    return _to_out(n)


# ---------- trash / restore / delete ----------

def _walk_subtree(db: Session, root: Node) -> list[Node]:
    out: list[Node] = []
    stack: list[Node] = [root]
    while stack:
        cur = stack.pop()
        out.append(cur)
        if cur.kind == "folder":
            kids = db.execute(select(Node).where(Node.parent_id == cur.id)).scalars().all()
            stack.extend(kids)
    return out


@router.post("/{node_id}/trash", response_model=NodeOut)
def trash(
    node_id: str,
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    n = _get_node(db, user, node_id)
    now = datetime.now(timezone.utc)
    for nd in _walk_subtree(db, n):
        if nd.trashed_at is None:
            nd.trashed_at = now
    db.commit()
    db.refresh(n)
    return _to_out(n)


@router.post("/{node_id}/restore", response_model=NodeOut)
def restore(
    node_id: str,
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    n = _get_node(db, user, node_id)
    # If parent is trashed, restore back to root so we don't surface into a
    # trashed folder.
    if n.parent_id is not None:
        parent = db.get(Node, n.parent_id)
        if parent and parent.trashed_at is not None:
            n.parent_id = None
    for nd in _walk_subtree(db, n):
        nd.trashed_at = None
    db.commit()
    db.refresh(n)
    return _to_out(n)


@router.delete("/{node_id}")
def delete_permanently(
    node_id: str,
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
    s: Settings = Depends(get_settings),
):
    n = _get_node(db, user, node_id)
    if n.trashed_at is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "trash first")

    subtree = _walk_subtree(db, n)
    file_ids = [nd.id for nd in subtree if nd.kind == "file"]

    if file_ids:
        s3 = get_s3()
        # delete_objects is capped at 1000 keys per call
        for i in range(0, len(file_ids), 1000):
            chunk = file_ids[i:i + 1000]
            try:
                s3.delete_objects(
                    Bucket=s.storage_bucket,
                    Delete={"Objects": [{"Key": k} for k in chunk], "Quiet": True},
                )
            except ClientError:
                # Don't block DB cleanup on storage errors; leftover objects
                # become an orphan-scrubber problem (TODO).
                pass

    db.delete(n)  # cascades through children
    db.commit()
    return {"ok": True}
