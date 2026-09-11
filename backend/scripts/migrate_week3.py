"""Explicit week 3 deployment. The pending security proposal is never loaded."""
import argparse
import os
from pathlib import Path
from sqlalchemy import create_engine, inspect, text

ROOT = Path(__file__).resolve().parents[2]
SQL = ROOT / "supabase/migrations/20260910124519_missions_feedback.sql"
TABLES = ("list_copy_events", "verified_visit_feedback")


def main():
    parser = argparse.ArgumentParser()
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--apply", action="store_true")
    modes.add_argument("--check", action="store_true")
    args = parser.parse_args()
    engine = create_engine(os.environ["DATABASE_URL"])
    if engine.dialect.name != "postgresql":
        raise SystemExit("PostgreSQL is required.")
    with engine.begin() as conn:
        if not inspect(conn).has_table("visit_participants"):
            raise SystemExit("Deploy the verified visits migration first.")
        if args.apply:
            conn.execute(text("SELECT pg_advisory_xact_lock(20260910, 3)"))
            conn.exec_driver_sql(SQL.read_text())
        for table in TABLES:
            if not inspect(conn).has_table(table):
                raise SystemExit(f"Missing table: {table}")
            print(f"{table}: {conn.execute(text(f'SELECT count(*) FROM {table}')).scalar_one()} rows")
        if not any(c["name"] == "computed_at" for c in inspect(conn).get_columns("user_embeddings")):
            raise SystemExit("Missing recommendation cache timestamp.")
    engine.dispose()


if __name__ == "__main__":
    main()
