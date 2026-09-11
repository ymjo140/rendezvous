"""Read-only HTTP smoke check; no credentials or writes to the application."""
import argparse
import json
import re
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, build_opener


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def check(base_url, expected_revision=None, timeout=10):
    parsed = urlsplit(base_url)
    if (parsed.username or parsed.password or parsed.query or parsed.fragment
            or parsed.path not in ("", "/") or not parsed.hostname
            or not (parsed.scheme == "https" or
                    (parsed.scheme == "http" and parsed.hostname in ("localhost", "127.0.0.1", "::1")))):
        raise ValueError("Use an HTTPS API origin or a localhost HTTP origin, without credentials or a path.")
    if expected_revision and not re.fullmatch(r"[a-fA-F0-9]{7,40}", expected_revision):
        raise ValueError("Expected revision must be a Git commit (7-40 hex digits).")
    # A workstation's corporate proxy must not receive local preview probes.
    local = parsed.hostname in ("localhost", "127.0.0.1", "::1")
    opener = build_opener(NoRedirect(), *([ProxyHandler({})] if local else []))
    results = []
    for probe, expected_status in (("live", "ok"), ("ready", "ready")):
        started = time.perf_counter()
        result = {"probe": probe, "ok": False}
        try:
            with opener.open(f"{base_url.rstrip('/')}/api/health/{probe}", timeout=timeout) as response:
                payload = json.loads(response.read(4097))
                revision = payload.get("revision", "unknown")
                valid_revision = isinstance(revision, str) and bool(re.fullmatch(r"[a-fA-F0-9]{7,40}", revision))
                result.update({"http_status": response.status, "revision": revision if valid_revision else "unknown"})
                result["ok"] = response.status == 200 and payload.get("status") == expected_status
                if expected_revision:
                    result["ok"] = result["ok"] and valid_revision and revision.lower().startswith(expected_revision.lower())
        except HTTPError as error:
            result["http_status"] = error.code
        except (URLError, TimeoutError, OSError, ValueError, AttributeError):
            result["error"] = "unavailable_or_invalid_response"
        result["duration_ms"] = round((time.perf_counter() - started) * 1000, 2)
        results.append(result)
    return {"ok": all(row["ok"] for row in results), "checks": results}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("api_origin")
    parser.add_argument("--expect-revision")
    args = parser.parse_args()
    try:
        result = check(args.api_origin, args.expect_revision)
    except ValueError as error:
        parser.error(str(error))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result["ok"] else 1)


if __name__ == "__main__":
    main()
