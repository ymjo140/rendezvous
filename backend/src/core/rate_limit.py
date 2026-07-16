# -*- coding: utf-8 -*-
"""경량 IP 레이트 리밋 미들웨어 — 외부 의존성 없음(단일 인스턴스 인메모리).
- 민감 경로(로그인/가입/카카오/충전): 분당 10회 — 브루트포스/충전 남용 방어
- 전체 API: 분당 300회 — 폭주/스크래핑 방어(정상 사용은 여유)
서버 여러 대로 확장하면 Redis 기반으로 교체 필요.
"""
import time
from collections import defaultdict, deque

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

STRICT_PREFIXES = (
    "/api/login",
    "/api/auth/",
    "/api/coins/charge",
)
STRICT_LIMIT = 10      # 분당
GLOBAL_LIMIT = 300     # 분당
WINDOW = 60.0          # 초


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self._hits: dict = defaultdict(deque)  # key -> deque[timestamp]
        self._last_sweep = time.time()

    def _client_ip(self, request) -> str:
        xff = request.headers.get("x-forwarded-for")
        if xff:
            return xff.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    def _hit(self, key: str, limit: int) -> bool:
        """True면 허용, False면 초과."""
        now = time.time()
        q = self._hits[key]
        while q and now - q[0] > WINDOW:
            q.popleft()
        if len(q) >= limit:
            return False
        q.append(now)
        return True

    def _sweep(self):
        """오래된 키 청소(메모리 무한 성장 방지) — 5분마다."""
        now = time.time()
        if now - self._last_sweep < 300:
            return
        self._last_sweep = now
        stale = [k for k, q in self._hits.items() if not q or now - q[-1] > WINDOW]
        for k in stale:
            self._hits.pop(k, None)

    async def dispatch(self, request, call_next):
        path = request.url.path
        # WebSocket/헬스체크/정적은 제외
        if not path.startswith("/api/") or path.startswith("/api/ws/"):
            return await call_next(request)

        ip = self._client_ip(request)
        self._sweep()

        if any(path.startswith(p) for p in STRICT_PREFIXES):
            if not self._hit(f"s:{ip}", STRICT_LIMIT):
                return JSONResponse(
                    status_code=429,
                    content={"detail": "요청이 너무 잦아요. 잠시 후 다시 시도해주세요."},
                )
        if not self._hit(f"g:{ip}", GLOBAL_LIMIT):
            return JSONResponse(
                status_code=429,
                content={"detail": "요청이 너무 많아요. 잠시 후 다시 시도해주세요."},
            )
        return await call_next(request)
