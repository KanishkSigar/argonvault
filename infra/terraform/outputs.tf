output "bucket_name" {
  value = aws_s3_bucket.vault.id
}

output "kms_key_id" {
  value = aws_kms_alias.vault.name
}

output "aws_access_key_id" {
  value     = aws_iam_access_key.vault_backend.id
  sensitive = true
}

output "aws_secret_access_key" {
  value     = aws_iam_access_key.vault_backend.secret
  sensitive = true
}
