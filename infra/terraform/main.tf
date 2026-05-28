terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
    }
  }
}

provider "aws" {
  region = var.region
}

# ---------------- KMS key for envelope encryption ----------------

resource "aws_kms_key" "vault" {
  description             = "Wraps per-file AES-256 data keys for argonvault"
  enable_key_rotation     = true
  deletion_window_in_days = 7
}

resource "aws_kms_alias" "vault" {
  name          = "alias/${var.project}"
  target_key_id = aws_kms_key.vault.key_id
}

# ---------------- S3 bucket for ciphertext ----------------

resource "aws_s3_bucket" "vault" {
  bucket        = var.bucket_name
  force_destroy = false
}

resource "aws_s3_bucket_public_access_block" "vault" {
  bucket                  = aws_s3_bucket.vault.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "vault" {
  bucket = aws_s3_bucket.vault.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "vault" {
  bucket = aws_s3_bucket.vault.id
  versioning_configuration {
    status = "Enabled"
  }
}

# The browser PUTs/GETs the ciphertext directly via presigned URLs, so the
# bucket must allow your frontend's origin.
resource "aws_s3_bucket_cors_configuration" "vault" {
  bucket = aws_s3_bucket.vault.id

  cors_rule {
    allowed_methods = ["GET", "PUT"]
    allowed_origins = var.allowed_origins
    allowed_headers = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

# ---------------- IAM user for the backend ----------------

resource "aws_iam_user" "vault_backend" {
  name = "${var.project}-backend"
}

resource "aws_iam_access_key" "vault_backend" {
  user = aws_iam_user.vault_backend.name
}

data "aws_iam_policy_document" "vault_backend" {
  statement {
    sid    = "S3RW"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:ListBucket",
    ]
    resources = [
      aws_s3_bucket.vault.arn,
      "${aws_s3_bucket.vault.arn}/*",
    ]
  }

  statement {
    sid    = "KmsEnvelope"
    effect = "Allow"
    actions = [
      "kms:GenerateDataKey",
      "kms:Decrypt",
      "kms:DescribeKey",
    ]
    resources = [aws_kms_key.vault.arn]
  }
}

resource "aws_iam_user_policy" "vault_backend" {
  name   = "${var.project}-backend"
  user   = aws_iam_user.vault_backend.name
  policy = data.aws_iam_policy_document.vault_backend.json
}
