from functools import lru_cache

import boto3
from botocore.config import Config

from .config import get_settings


@lru_cache
def get_s3():
    """Return a boto3 S3 client that points at AWS S3 by default, or any
    S3-compatible service (Cloudflare R2, MinIO, Backblaze B2) when
    STORAGE_ENDPOINT_URL is set."""
    s = get_settings()
    kwargs = dict(
        aws_access_key_id=s.storage_access_key_id,
        aws_secret_access_key=s.storage_secret_access_key,
        region_name=s.storage_region,
        config=Config(signature_version="s3v4", retries={"max_attempts": 3, "mode": "standard"}),
    )
    if s.storage_endpoint_url:
        kwargs["endpoint_url"] = s.storage_endpoint_url
    return boto3.client("s3", **kwargs)
