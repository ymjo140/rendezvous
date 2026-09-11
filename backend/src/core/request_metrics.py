"""Route-level latency and failures; never log query strings, bodies, or identity."""
import json
import logging
from datetime import datetime, timezone
from time import perf_counter
from uuid import uuid4

logger = logging.getLogger("uvicorn.error")


class RequestMetricsMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        started, status, request_id = perf_counter(), 500, uuid4().hex
        failed = False

        async def respond(message):
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                message = {**message, "headers": [*message.get("headers", []),
                            (b"x-request-id", request_id.encode())]}
            await send(message)

        try:
            await self.app(scope, receive, respond)
        except Exception:
            failed = True
            raise
        finally:
            logger.info(json.dumps({"event": "api_request", "request_id": request_id,
                        "at": datetime.now(timezone.utc).isoformat(), "failed": failed,
                        "method": scope["method"], "route": getattr(scope.get("route"), "path", "unmatched"),
                        "status": status, "duration_ms": round((perf_counter() - started) * 1000, 2)}))
