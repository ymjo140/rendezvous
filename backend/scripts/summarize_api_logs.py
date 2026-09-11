"""Aggregate exported api_request JSON lines; accepts logging prefixes, no uploads."""
import argparse
from collections import defaultdict
import json
import math
import sys


def summarize(lines):
    groups = defaultdict(list)
    ignored = 0
    for line in lines:
        try:
            row = json.loads(line[line.index("{"):])
            duration, status = row["duration_ms"], row["status"]
            route, method = row["route"], row["method"]
            if (row.get("event") != "api_request" or isinstance(duration, bool)
                    or not isinstance(duration, (int, float)) or not math.isfinite(duration) or duration < 0
                    or type(status) is not int or not 100 <= status <= 599
                    or not isinstance(route, str) or len(route) > 200 or "?" in route or "#" in route
                    or method not in ("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD")):
                raise ValueError()
            groups[(method, route)].append((duration, status >= 500 or row.get("failed") is True))
        except (ValueError, KeyError, TypeError, AttributeError):
            ignored += 1
    output = []
    for (method, route), requests in sorted(groups.items()):
        durations = sorted(item[0] for item in requests)
        failures = sum(item[1] for item in requests)
        def percentile(fraction):
            return round(durations[max(0, math.ceil(len(durations) * fraction) - 1)], 2)
        output.append({"method": method, "route": route, "requests": len(requests), "failures": failures,
                       "failure_rate": round(failures / len(requests), 4),
                       "p50_ms": percentile(.5), "p95_ms": percentile(.95), "p99_ms": percentile(.99)})
    return {"requests": sum(row["requests"] for row in output), "ignored_lines": ignored, "routes": output}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", nargs="?", default="-", help="Log export or - for stdin; select the time window when exporting.")
    args = parser.parse_args()
    if args.file == "-":
        result = summarize(sys.stdin)
    else:
        with open(args.file, encoding="utf-8") as source:
            result = summarize(source)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
