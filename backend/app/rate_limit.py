"""Tiny in-memory sliding-window rate limiter.

No external dependencies; not durable across restarts. Per-IP only — sufficient
for the demo / portfolio scale and for closing the SECURITY.md item without
pulling in another package.
"""
from collections import deque
from threading import Lock
from time import monotonic

from fastapi import HTTPException, Request, status


class SlidingWindowLimiter:
    def __init__(self, *, max_requests: int, window_seconds: float) -> None:
        self.max = max_requests
        self.window = window_seconds
        self._hits: dict[str, deque[float]] = {}
        self._lock = Lock()

    def check(self, key: str) -> None:
        """Raise HTTPException 429 if `key` has exceeded the budget."""
        now = monotonic()
        cutoff = now - self.window
        with self._lock:
            q = self._hits.setdefault(key, deque())
            while q and q[0] < cutoff:
                q.popleft()
            if len(q) >= self.max:
                retry_after = max(1, int(q[0] + self.window - now))
                raise HTTPException(
                    status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="too many requests",
                    headers={"Retry-After": str(retry_after)},
                )
            q.append(now)

            # opportunistic GC so memory doesn't grow forever on a long-running
            # process: prune empty deques every ~1000 hits.
            if len(self._hits) > 1000:
                for k in list(self._hits):
                    if not self._hits[k]:
                        self._hits.pop(k, None)


def client_ip(request: Request) -> str:
    """Best-effort IP. Trusts X-Forwarded-For only if explicitly set by the
    proxy in front (configure your ALB / API Gateway to set it)."""
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# Tuned for human pace; bots will trip these quickly. Login is the costly path
# (server-side Argon2id verify), so it's the strictest.
login_limiter = SlidingWindowLimiter(max_requests=5, window_seconds=60)
prelogin_limiter = SlidingWindowLimiter(max_requests=20, window_seconds=60)
register_limiter = SlidingWindowLimiter(max_requests=3, window_seconds=300)
