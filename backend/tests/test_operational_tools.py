from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from threading import Thread

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.scripts.check_deployment import check
from backend.scripts.summarize_api_logs import summarize
from core.request_metrics import RequestMetricsMiddleware


def test_deployment_check_requires_ready_and_expected_revision():
    state = {"ready_status": 200, "revision": "b" * 40}
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass
        def do_GET(self):
            ready = self.path.endswith("ready")
            self.send_response(state["ready_status"] if ready else 200)
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ready" if ready else "ok", "revision": state["revision"]}).encode())
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        origin = f"http://127.0.0.1:{server.server_port}"
        assert check(origin, "b" * 7)["ok"] is True
        assert check(origin, "a" * 7)["ok"] is False
        state["ready_status"] = 503
        assert check(origin)["ok"] is False
        state["ready_status"] = 200
        state["revision"] = "unknown"
        assert check(origin, "b" * 7)["ok"] is False
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


@pytest.mark.parametrize("url", ["http://example.com", "https://token@example.com", "https://example.com/?token=secret"])
def test_deployment_check_rejects_credentials_and_nonlocal_cleartext(url):
    with pytest.raises(ValueError):
        check(url)


def test_log_summary_percentiles_failures_and_malformed_rows():
    lines = [json.dumps({"event": "api_request", "method": "GET", "route": "/api/groups/{cid}/kitchen",
                         "duration_ms": value, "status": 500 if value == 20 else 200}) for value in range(1, 21)]
    lines += ["unrelated startup", '{"event":"api_request","duration_ms":NaN}',
              '{"event":"api_request","duration_ms":-10}']
    result = summarize(lines)
    assert result["requests"] == 20 and result["ignored_lines"] == 3
    route = result["routes"][0]
    assert (route["p50_ms"], route["p95_ms"], route["p99_ms"]) == (10, 19, 20)
    assert route["failures"] == 1 and route["failure_rate"] == .05


def test_request_failure_is_logged_without_exception_details(caplog):
    import logging
    app = FastAPI()
    app.add_middleware(RequestMetricsMiddleware)
    @app.get("/broken/{value}")
    def broken(value: str):
        raise RuntimeError("secret database detail")
    with caplog.at_level(logging.INFO, logger="uvicorn.error"):
        with TestClient(app, raise_server_exceptions=False) as client:
            assert client.get("/broken/private-id?token=secret").status_code == 500
    rows = [json.loads(row.message) for row in caplog.records if row.message.startswith("{")]
    assert rows[-1]["failed"] is True and rows[-1]["status"] == 500
    assert rows[-1]["at"].endswith("+00:00")
    assert "private-id" not in caplog.text and "secret" not in caplog.text
