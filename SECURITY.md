# Security notes & self-review

This document is a self-pen-test of ArgonVault. It enumerates the threat
model boundaries (see [`README.md`](README.md#threat-model) for the table),
documents reviewed attack surfaces, and lists known weaknesses with mitigations
either applied or roadmapped.

If you find a vulnerability beyond what's listed here, please open an issue
with a redacted description (not a PoC) so the project can be patched before
disclosure.

## Reviewed attack surfaces

### 1. Authentication

- **Password is never sent to the server.** Login derives `auth_token` in the
  browser via Argon2id and sends only the high-entropy token. Server stores
  `Argon2id(auth_token)`; even a full DB leak does not expose the password
  unless the attacker also recovers `auth_token` and runs another Argon2id
  pass to verify a guessed password.
- **Email enumeration is blocked.** `/auth/prelogin` returns a deterministic
  HMAC-derived dummy salt for unregistered emails, so response shape and
  timing are indistinguishable. Timing of *login* differs — see *Known
  weaknesses* below.
- **Session cookie**: `httpOnly`, `SameSite=Lax`, 12-hour expiry. Not readable
  by JavaScript, not sent on cross-site form posts.
- **No password reset.** Documented as a feature (zero-knowledge); will be
  swapped for Shamir-shared recovery when that lands.

### 2. Object storage

- The browser PUTs/GETs **ciphertext only**, via short-lived (15 min)
  presigned URLs. The backend never touches plaintext bytes.
- S3 bucket policy: public access blocked, versioning on, SSE enabled at-rest
  (defense in depth — server-side encryption uses S3's own key, separate from
  client-side encryption).
- CORS policy is restricted to the configured frontend origin(s); no `*`.
- Object keys are random UUIDs with no semantic content. Filenames are stored
  encrypted in the database, never as S3 metadata.

### 3. Path traversal / IDOR

- All node operations require the JWT cookie. The handler checks
  `node.user_id == request.user.id` before any read or mutation. There is no
  user-controlled file path — only opaque UUIDs.
- `move` actively walks the tree to reject cycles (cannot move a folder into
  its own descendant).
- `restore` re-parents to root if the original parent is also trashed, so an
  attacker can't smuggle entries back into someone else's trash.

### 4. CSRF

- All state-changing endpoints accept `application/json` only (no
  `application/x-www-form-urlencoded`). Combined with `SameSite=Lax` cookies
  and a restricted CORS policy, this blocks classic CSRF.
- No `<form action>` posting to any sensitive endpoint.

### 5. XSS

- The Next.js app uses React's escape-by-default rendering for filenames and
  email addresses. No `dangerouslySetInnerHTML`.
- Preview modal renders user-controlled content in:
  - `<img>` with a blob URL (no script execution path)
  - `<video>`, `<audio>` (no script execution path)
  - `<iframe>` for PDF blobs — the iframe is sandboxed by the same-origin
    blob URL; `pdfjs` runs in the iframe under blob origin, not the app
    origin. *PDF JavaScript is a vector* — see *Known weaknesses*.

### 6. Brute-force / abuse

- Argon2id with 64 MiB / 3 iters in the browser means **one** login attempt
  costs about 250–500 ms of work on the attacker's machine; coupled with the
  server's second Argon2id pass, a missed attempt costs the attacker
  meaningful CPU. Additionally, per-IP sliding-window rate limits cap login
  at 5/min, prelogin at 20/min, and registration at 3 / 5 min.

### 7. Sensitive material in memory

- The unlocked `vault_key` lives in `sessionStorage` for the lifetime of the
  tab. It is cleared on logout. It is *not* cleared on tab close because
  the browser already drops sessionStorage on tab close.
- The `wrap_key` is computed during login, used once to unwrap `vault_key`,
  and not stored. It exists in `WebCrypto` only briefly via
  `crypto.subtle.importKey({ extractable: false })`. (Currently the
  intermediate bytes pass through JavaScript before being imported — see
  *Known weaknesses*.)

### 8. Dependency hygiene

- Backend pin: `fastapi`, `pydantic`, `cryptography`, `argon2-cffi`, `boto3`,
  `SQLAlchemy`, `mangum`, `PyJWT`.
- Frontend pin: Next.js, `hash-wasm` (for Argon2id).
- All deps from the public PyPI / npm registries; no vendored crypto.
- `npm audit` and `pip-audit` runs are TODO in CI.

## Known weaknesses (and what we'll do)

| # | Issue | Severity | Mitigation status |
|---|---|---|---|
| 1 | ~~No rate limit on `/auth/login` or `/auth/prelogin`.~~ | Medium | **Mitigated.** Per-IP sliding-window limiter (see [`backend/app/rate_limit.py`](backend/app/rate_limit.py)): `/auth/login` 5/min, `/auth/prelogin` 20/min, `/auth/register` 3/5min. Returns `429 Too Many Requests` with `Retry-After`. |
| 2 | Timing side-channel on `/auth/login`: known-user verify takes a full Argon2id, unknown-user returns ~immediately. | Medium | Always run a constant-time fake Argon2id verify on unknown emails. |
| 3 | Folder *structure* (parent/child relationships, counts) is visible to the server even though names are encrypted. | Low | Padding + dummy nodes to make tree shape opaque; deferred until structure-hiding feature is built. |
| 4 | PDF preview uses `<iframe>` with blob URL — a malicious PDF could execute JS in the blob origin. Blob origin can't reach app cookies but could attempt fingerprinting. | Low | Switch to `pdfjs-dist` rendering directly into `<canvas>` to drop the iframe entirely. |
| 5 | "Trust the JS bundle" — every login derives the password via JS the server delivered. A malicious server could swap in exfiltrating JS. | Inherent (browser crypto) | Add Subresource Integrity (SRI) on the frontend bundle. Long-term: optional browser-extension client that uses a pinned local crypto build. |
| 6 | No CSP header. | Low | Add `Content-Security-Policy: default-src 'self'; img-src 'self' blob:; ...` in production. |
| 7 | No re-encrypt path if user changes password. | Medium | On password change, re-derive `wrap_key` and re-wrap the existing `vault_key`; do not rotate `vault_key` itself (preserves all file access). To be added with the password-change UI. |
| 8 | Orphaned S3 objects when a `complete-upload` never arrives. | Low | Background scrubber: any object with no matching `nodes` row older than 1 hour is deletable. |
| 9 | No 2FA. | Medium | Roadmapped after Shamir recovery (so users don't lock themselves out by adding TOTP without backup). |
| 10 | Wrapped vault key is only protected by the password-derived key. Forgetting password = total loss. | High (UX) | Shamir's Secret Sharing recovery (roadmap). |

## Things the design intentionally does NOT do

- **No "convenience" key escrow on the server.** The price of zero-knowledge
  is that we can't email you a reset link. This is a feature, not a TODO.
- **No silent recovery via email.** Same reason.
- **No server-side filename search.** Search must happen client-side over
  decrypted names; building a searchable encryption index server-side would
  leak query patterns. Roadmapped as encrypted-tag search instead.

## Pen-test transcript (representative tries)

> *These are the actual attacks I tried while building this. The point of
> writing this section is to demonstrate that the design was tested adversarially,
> not just shipped on hope.*

- **Tried**: hit `/nodes/<other-users-uuid>/download` with my own JWT.
  **Result**: 404. The handler refuses cross-user reads in `_get_node`.
- **Tried**: send a `move` request where `new_parent_id` is the node's own
  descendant (would create a cycle, break listing).
  **Result**: 400 — the cycle walker catches it.
- **Tried**: send `parent_id` pointing to another user's folder on
  `init-upload`. **Result**: 400 — `_assert_folder_owned` rejects.
- **Tried**: omit `parent_id` query string on `GET /nodes` to see if it
  defaults to root for *any* user. **Result**: works as designed — returns
  *my* root.
- **Tried**: re-use a presigned PUT URL with attacker-controlled content type.
  **Result**: succeeds (S3 only enforces the URL, not the content), but the
  uploaded blob is meaningless to the vault — without a matching DB row +
  data key it cannot be listed or decrypted. Storage abuse is a denial-of-budget
  concern, not a confidentiality one.
- **Tried**: replay a stale JWT cookie after logout.
  **Result**: cookie is cleared on logout but the JWT itself is still
  signature-valid until its 12-hour expiry — a stolen JWT survives logout.
  *Open: server-side denylist needed. Documented under #1 above.*
- **Tried**: GET `/auth/prelogin?email=admin@example.com` vs an unregistered
  email and compare responses. **Result**: indistinguishable JSON (same shape,
  same salt length, same iteration count).

## Reporting a vulnerability

Please open a GitHub issue with the description redacted to "I'd like to
disclose a security issue, please contact me at <email>" — and I will follow
up via email to coordinate disclosure.
