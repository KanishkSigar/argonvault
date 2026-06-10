<div align="center">

# ArgonVault

**Zero-knowledge encrypted file vault.**
The server holds your ciphertext. The server cannot read your files, your filenames, or your password.

<sub>Argon2id · AES-256-GCM · WebCrypto · FastAPI · Next.js 15 · S3-compatible</sub>

<p>
  <img src="https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs&logoColor=white" alt="Next.js 15"/>
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React 19"/>
  <img src="https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white" alt="FastAPI"/>
  <img src="https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white" alt="Python 3.11+"/>
  <img src="https://img.shields.io/badge/AWS%20S3-569A31?logo=amazons3&logoColor=white" alt="AWS S3"/>
  <img src="https://img.shields.io/badge/crypto-Argon2id%20%C2%B7%20AES--256--GCM-4B0082" alt="Argon2id + AES-256-GCM"/>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"/></a>
</p>

</div>

---

## What it is

A small web app where you sign up, drop files into folders, and the operator
of the service is cryptographically prevented from looking at them — even with
a database leak, a root shell on the API box, or full access to the storage
bucket.

Built as a portfolio piece for applied cryptography and AWS-shaped
architecture. Same category as Proton Drive, Cryptomator, MEGA.

```
┌──────────────────────────────────────────────────────────────────────┐
│ Browser  ─ the only place plaintext ever exists                      │
│                                                                      │
│   password ── Argon2id ──▶  wrap_key  +  auth_token                  │
│   wrap_key ── unwrap   ──▶  vault_key (32 random bytes per user)     │
│   vault_key ── encrypt ──▶  filenames, per-file data keys            │
│   data_key  ── AES-GCM ──▶  file bytes                               │
└─────────────────────────────────────┬────────────────────────────────┘
                                      │  presigned PUT/GET
                                      ▼
┌──────────────────────────────────────────────────────────────────────┐
│ FastAPI  ─ key broker · metadata · auth · never sees plaintext       │
└─────────────────────────────────────┬────────────────────────────────┘
                                      │  boto3 S3 API
                                      ▼
┌──────────────────────────────────────────────────────────────────────┐
│ S3 / MinIO  ─ opaque ciphertext at UUID keys, no names, no metadata  │
└──────────────────────────────────────────────────────────────────────┘
```

## Why it's interesting

- **Real zero-knowledge.** Most "encrypted upload" projects on GitHub keep the
  key on the server. ArgonVault doesn't — the key never leaves the browser, and
  there is no password reset.
- **End-to-end metadata encryption.** Filenames and folder names are encrypted
  client-side too, not just file bytes. The server sees opaque blobs at
  meaningless UUIDs.
- **Properly modern crypto stack.** Argon2id (memory-hard, GPU-resistant) for
  password key derivation, AES-256-GCM (authenticated) everywhere else, envelope
  encryption pattern (analogous to AWS KMS), anti-enumeration prelogin.
- **Direct browser → S3 transfers.** The backend never touches plaintext bytes.
  Eliminates size limits and bandwidth bottlenecks; the API box can be a single
  Lambda regardless of file size.
- **S3-compatible by design.** The same `boto3` code runs against AWS S3,
  MinIO, Cloudflare R2, or Backblaze B2 — only the endpoint URL changes.
- **Documented threat model + self-pen-test.** See
  [`README.md#threat-model`](#threat-model) and [`SECURITY.md`](SECURITY.md).

## Stack

| Layer | What |
|---|---|
| **Frontend** | Next.js 15 (App Router) · React 19 · TypeScript · WebCrypto · [hash-wasm](https://github.com/Daninet/hash-wasm) for Argon2id · [lucide-react](https://lucide.dev) icons |
| **Backend** | Python 3.11+ · FastAPI · SQLAlchemy 2 · Pydantic v2 · `argon2-cffi` · `PyJWT` · `boto3` · Mangum (Lambda-ready) |
| **Storage** | Any S3-compatible object store. Local dev = MinIO. Production = AWS S3. |
| **Database** | SQLite for dev, swap to Postgres via env. Holds users, folder tree, per-file wrapped keys. |
| **Auth** | Multi-user. Client-derived auth token, never sends raw password. JWT in `httpOnly SameSite=Lax` cookie. Per-IP sliding-window rate limits. |

## Threat model

### Protected against

| Attacker capability | Outcome |
|---|---|
| Full backend compromise (RCE on API) | Cannot read files; cannot read filenames; cannot impersonate users without breaking Argon2id. |
| Storage compromise (full S3/MinIO read) | Opaque ciphertext under UUID keys. No filenames, no folder structure, no user mapping. |
| Database dump | Wrapped vault keys + Argon2id hashes + KDF params. Offline brute-force is memory-hard. |
| Passive network observer | TLS only. Visible: ciphertext flowing to S3, public KDF params on prelogin. |
| MITM with stolen TLS cert | Can intercept the auth_token (not password, not vault key). Cannot read files. |
| Account enumeration | Prelogin returns a deterministic HMAC-derived dummy salt for unknown emails. |
| CSRF | JWT cookie is `httpOnly, SameSite=Lax`; state-changing routes JSON-only and CORS-restricted. |
| Stolen presigned URL | 15-min expiry, scoped to one S3 object, contents still encrypted. |
| Auth brute force | Per-IP sliding-window limits: 5/min on login, 20/min on prelogin, 3 / 5 min on register. |

### Not protected against

| Attacker capability | Outcome |
|---|---|
| Compromised browser / malicious extension | Game over — same as for any browser-delivered crypto. |
| Forgotten password | All data lost. No recovery path today (Shamir recovery is on the roadmap). |
| Malicious server modifying the JS bundle | Could swap in exfiltrating JS on next login. Mitigations: SRI, browser-extension client. (Inherent to web crypto.) |

## Cryptographic specification

All primitives from `crypto.subtle` (WebCrypto) and [`hash-wasm`](https://github.com/Daninet/hash-wasm)
(Argon2id only). No hand-rolled crypto.

| Purpose | Algorithm | Parameters |
|---|---|---|
| Password → key (browser) | **Argon2id** (RFC 9106) | 64 MiB · 3 iters · p=1 · 64-byte output |
| Auth verification (server) | **Argon2id** via `argon2-cffi` | library defaults |
| Symmetric encryption (everywhere) | **AES-256-GCM** | random 12-byte nonces |
| Anti-enumeration salt | **HMAC-SHA256** | server pepper, lowercased email |
| Session signing | JWT HS256 | 12-hour expiry, `httpOnly SameSite=Lax` |
| Random | `crypto.getRandomValues` / `os.urandom` | OS CSPRNG |

### KDF (login & signup)
```
salt        ← 16 random bytes (per user, generated at signup)
output      = Argon2id(password, salt, m=65536, t=3, p=1, len=64)
wrap_key    = output[0:32]
auth_token  = base64( output[32:64] )    // sent to server
```
Server stores `Argon2id(auth_token)` (second pass). Raw password and
`wrap_key` never leave the browser.

### Envelope encryption
```
wrapped_vault_key = nonce(12) || AES-256-GCM(wrap_key, vault_key)
wrapped_data_key  = nonce(12) || AES-256-GCM(vault_key, data_key)
ciphertext_file   = AES-256-GCM(data_key, plaintext, iv=file_nonce)
```

### Name encryption
```
name_nonce      = 12 random bytes (per name)
name_ciphertext = AES-256-GCM(vault_key, utf8(name), iv=name_nonce)
```
Server stores base64 of `(name_ciphertext, name_nonce)`. Folder structure
(parent/child relationships) is leaked — hiding it is on the roadmap.

## Quick start (zero AWS, zero cards, zero Docker)

Prereqs: Python 3.11+, Node 20+.

### 1. Storage — MinIO

```powershell
# Windows
mkdir .minio\data
curl -L -o .minio\minio.exe https://dl.min.io/server/minio/release/windows-amd64/minio.exe

$env:MINIO_ROOT_USER = "minioadmin"; $env:MINIO_ROOT_PASSWORD = "minioadmin"
.\.minio\minio.exe server .\.minio\data --console-address ":9001"
```

```bash
# macOS / Linux
brew install minio/stable/minio
minio server ./.minio/data --console-address ":9001"
```

Open the MinIO console at <http://localhost:9001> (login `minioadmin`/`minioadmin`)
→ **Create Bucket** → name it `vault`.

### 2. Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows
# source .venv/bin/activate       # macOS/Linux
pip install -r requirements.txt

cp .env.example .env
python scripts/gen_secrets.py >> .env

uvicorn app.main:app --reload --port 8000
```

SQLite is created at `backend/vault.db` on first request.

### 3. Frontend

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```

Open <http://localhost:3000>, click **Create one**, drag files in.

To **prove zero-knowledge**: open the MinIO console at <http://localhost:9001> →
browse the `vault` bucket → every object is a UUID and every blob is unreadable
ciphertext. The filenames you typed never reach the server.

## Project layout

```
argonvault/
├── README.md                  ← this file
├── SECURITY.md                ← self-pen-test, attempts log, weaknesses
├── docker-compose.yml         ← alternative way to run MinIO
├── .gitignore
│
├── backend/                   ← FastAPI key broker + auth
│   ├── .env.example
│   ├── requirements.txt
│   ├── Dockerfile             ← App Runner / Render / ECS
│   ├── lambda_handler.py      ← Mangum entry for AWS Lambda
│   ├── scripts/
│   │   └── gen_secrets.py     ← JWT_SECRET + EMAIL_ENUM_PEPPER
│   └── app/
│       ├── main.py            ← FastAPI app + CORS + lifespan
│       ├── config.py          ← pydantic-settings
│       ├── db.py              ← SQLAlchemy engine + session
│       ├── models.py          ← User · Node (folder tree)
│       ├── auth.py            ← Argon2 verify + JWT cookie
│       ├── storage.py         ← boto3 S3 client (endpoint-override aware)
│       ├── rate_limit.py      ← in-memory sliding-window per-IP limiter
│       ├── schemas.py         ← typed request/response models
│       └── routes/
│           ├── auth.py        ← prelogin · register · login · logout · me
│           └── nodes.py       ← list · folder · upload · download · trash · restore · rename · move · delete
│
├── frontend/                  ← Next.js 15 App Router + TS + React 19
│   ├── package.json
│   ├── .env.local.example
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── globals.css        ← green/black minimalist theme
│   │   ├── page.tsx           ← auth gate
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx
│   │   └── vault/page.tsx     ← folder grid · DnD · trash · preview
│   └── lib/
│       ├── api.ts             ← typed fetch wrapper
│       ├── crypto.ts          ← Argon2id, WebCrypto AES-GCM, helpers
│       ├── vault.ts           ← high-level orchestration
│       └── vaultSession.ts    ← unlocked vault key in sessionStorage
│
└── infra/
    ├── s3-cors.json           ← bucket CORS for direct browser PUT/GET
    └── terraform/             ← optional AWS provisioning (S3 + KMS + IAM)
```

## Swapping local storage for AWS

No code changes — just env:

```diff
- STORAGE_ENDPOINT_URL=http://localhost:9000
- STORAGE_REGION=us-east-1
+ STORAGE_ENDPOINT_URL=
+ STORAGE_REGION=ap-south-1
  STORAGE_ACCESS_KEY_ID=<aws iam access key>
  STORAGE_SECRET_ACCESS_KEY=<aws iam secret>
  STORAGE_BUCKET=<aws bucket>
```

`infra/terraform/` provisions a private S3 bucket, a KMS key with rotation
enabled, a CORS policy, and a least-privilege IAM user.

## Deploy

- **Frontend** → Vercel. Project root `frontend/`, set `NEXT_PUBLIC_API_URL`
  to your backend URL.
- **Backend** → AWS Lambda (Mangum) behind API Gateway, or
  App Runner / Render / Fly using `backend/Dockerfile`.
- Set `COOKIE_SECURE=true` and `CORS_ORIGINS=https://<your-frontend>` for any
  non-local deployment.
- File bytes never traverse the API (browser PUTs straight to S3), so
  Lambda's 6 MB request limit doesn't bite.

## Roadmap

| Feature | Why |
|---|---|
| Asymmetric file sharing (X25519 + ECIES) | Share a file with another user without re-encrypting; server still can't read it. |
| Shamir's Secret Sharing recovery | K-of-N share split — fixes "forgot password = lost data." |
| HMAC-chained audit log | Tamper-evident action history. |
| Hide folder structure | Today, parent/child relationships are visible to the server. Padding + dummy nodes would mask shape. |
| Encrypted-tag search | Client-side search index that doesn't leak query patterns to the server. |
| Browser-extension client | Removes the "trust the JS bundle" problem on each login. |
| 2FA (TOTP) | Layered defense; deferred until recovery exists. |

See [`SECURITY.md`](SECURITY.md) for the full set of known weaknesses, severities, and mitigation status.

## License

Released under the [MIT License](LICENSE) — do what you want, no warranty.
