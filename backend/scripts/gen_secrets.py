"""Print env values for first-time setup.

    python scripts/gen_secrets.py

Outputs JWT_SECRET and EMAIL_ENUM_PEPPER. Paste into backend/.env.

Note: per-user secrets are derived client-side from each user's password and
never reach the server.
"""
import secrets


def main() -> int:
    print("JWT_SECRET=" + secrets.token_urlsafe(48))
    print("EMAIL_ENUM_PEPPER=" + secrets.token_urlsafe(32))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
