"""Explicit, transactional migration. No DB mutation during API startup."""
import argparse
import os
from pathlib import Path

from sqlalchemy import create_engine, inspect, text

TABLES = ("visit_events", "visit_participants", "visit_approval_requests", "partnership_redemptions")
SQL = Path(__file__).resolve().parents[1] / "src/migrations/20260908_verified_visits.sql"
LOCATION_SQL = Path(__file__).resolve().parents[1] / "src/migrations/20260920_location_checkin.sql"


def main():
    parser = argparse.ArgumentParser()
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--apply", action="store_true", help="Create additive tables in one transaction")
    modes.add_argument("--check", action="store_true", help="Check tables and app-role read access (default)")
    args = parser.parse_args()
    engine = create_engine(os.environ["DATABASE_URL"])
    if engine.dialect.name != "postgresql":
        raise SystemExit("This migration requires PostgreSQL.")
    with engine.begin() as conn:
        if args.apply:
            conn.execute(text("SELECT pg_advisory_xact_lock(20260908, 2)"))
            conn.exec_driver_sql(SQL.read_text())
            conn.exec_driver_sql(LOCATION_SQL.read_text())
        missing = set(TABLES) - set(inspect(conn).get_table_names())
        if missing:
            raise SystemExit("Missing tables: " + ", ".join(sorted(missing)))
        for table in TABLES:
            # Fixed table names only. Also checks access using Render's DB role.
            count = conn.execute(text(f"SELECT count(*) FROM {table}")).scalar_one()
            print(f"{table}: {count} rows")
    engine.dispose()
    print("Verified visit schema ready.")


if __name__ == "__main__":
    main()
