variable "region" {
  type        = string
  description = "AWS region (e.g. ap-south-1)"
}

variable "project" {
  type        = string
  default     = "argonvault"
  description = "Used as prefix/alias for KMS + IAM names"
}

variable "bucket_name" {
  type        = string
  description = "Globally-unique S3 bucket name for ciphertext"
}

variable "allowed_origins" {
  type        = list(string)
  description = "Frontend origins allowed to PUT/GET via presigned URLs"
  default     = ["http://localhost:3000"]
}
