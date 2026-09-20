-- Week 2: additive verified attendance + separate benefit ledger.
-- Run once in a transaction before deploying week 2 API. Safe to rerun.
-- Deliberately NO backfill from reservations, mock splits, feedback or old check-ins.

CREATE TABLE IF NOT EXISTS visit_events (
	id VARCHAR NOT NULL, 
	place_id INTEGER NOT NULL, 
	community_id VARCHAR, 
	personal_user_id INTEGER, 
	scope_key VARCHAR(160) NOT NULL, 
	visit_date_kst DATE NOT NULL, 
	occurred_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	verified_at TIMESTAMP WITH TIME ZONE, 
	status VARCHAR(16) NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_visit_scope_place_day UNIQUE (scope_key, place_id, visit_date_kst), 
	CONSTRAINT ck_visit_scope CHECK ((community_id IS NOT NULL AND personal_user_id IS NULL AND scope_key = 'crew:' || community_id) OR (community_id IS NULL AND personal_user_id IS NOT NULL AND scope_key = 'user:' || CAST(personal_user_id AS VARCHAR))), 
	CONSTRAINT ck_visit_status CHECK ((status = 'pending' AND verified_at IS NULL) OR (status = 'verified' AND verified_at IS NOT NULL)), 
	FOREIGN KEY(place_id) REFERENCES places (id), 
	FOREIGN KEY(community_id) REFERENCES communities (id), 
	FOREIGN KEY(personal_user_id) REFERENCES users (id)
);

CREATE INDEX IF NOT EXISTS ix_visit_crew_status_day ON visit_events (community_id, status, visit_date_kst);
CREATE INDEX IF NOT EXISTS ix_visit_events_community_id ON visit_events (community_id);
CREATE INDEX IF NOT EXISTS ix_visit_events_place_id ON visit_events (place_id);
ALTER TABLE visit_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS visit_participants (
	id VARCHAR NOT NULL, 
	visit_id VARCHAR NOT NULL, 
	user_id INTEGER NOT NULL, 
	evidence_type VARCHAR(32) NOT NULL, 
	evidence_ref VARCHAR(100) NOT NULL, 
	occurred_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	verified_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	reported_party_size INTEGER NOT NULL, 
	context_tag VARCHAR(16), 
	distance_m FLOAT, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_visit_participant UNIQUE (visit_id, user_id), 
	CONSTRAINT ck_visit_evidence CHECK (evidence_type IN ('location', 'signed_qr', 'merchant_approval')),
	FOREIGN KEY(visit_id) REFERENCES visit_events (id) ON DELETE CASCADE, 
	FOREIGN KEY(user_id) REFERENCES users (id)
);

CREATE INDEX IF NOT EXISTS ix_visit_participants_user_id ON visit_participants (user_id);
CREATE INDEX IF NOT EXISTS ix_visit_participants_visit_id ON visit_participants (visit_id);
ALTER TABLE visit_participants ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS visit_approval_requests (
	id VARCHAR NOT NULL, 
	place_id INTEGER NOT NULL, 
	user_id INTEGER NOT NULL, 
	community_id VARCHAR, 
	scope_key VARCHAR(160) NOT NULL, 
	visit_date_kst DATE NOT NULL, 
	reported_party_size INTEGER NOT NULL, 
	context_tag VARCHAR(16), 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	expires_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	approved_at TIMESTAMP WITH TIME ZONE, 
	approved_by VARCHAR(100), 
	visit_id VARCHAR, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_visit_approval_day UNIQUE (scope_key, place_id, user_id, visit_date_kst), 
	FOREIGN KEY(place_id) REFERENCES places (id), 
	FOREIGN KEY(user_id) REFERENCES users (id), 
	FOREIGN KEY(community_id) REFERENCES communities (id), 
	FOREIGN KEY(visit_id) REFERENCES visit_events (id)
);

CREATE INDEX IF NOT EXISTS ix_visit_approval_requests_place_id ON visit_approval_requests (place_id);
ALTER TABLE visit_approval_requests ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS partnership_redemptions (
	id VARCHAR NOT NULL, 
	app_id INTEGER NOT NULL, 
	visit_id VARCHAR NOT NULL, 
	user_id INTEGER NOT NULL, 
	idempotency_key VARCHAR(128) NOT NULL, 
	used_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	usage_month VARCHAR(7) NOT NULL, 
	terms_snapshot JSON NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_redemption_visit UNIQUE (app_id, visit_id), 
	CONSTRAINT uq_redemption_key UNIQUE (app_id, idempotency_key), 
	FOREIGN KEY(app_id) REFERENCES crew_partnership_apps (id), 
	FOREIGN KEY(visit_id) REFERENCES visit_events (id), 
	FOREIGN KEY(user_id) REFERENCES users (id)
);

CREATE INDEX IF NOT EXISTS ix_partnership_redemptions_app_id ON partnership_redemptions (app_id);
CREATE INDEX IF NOT EXISTS ix_redemption_app_month ON partnership_redemptions (app_id, usage_month);
ALTER TABLE partnership_redemptions ENABLE ROW LEVEL SECURITY;

-- API-only tables: keep server access, remove Supabase's legacy client grants.
-- Role checks also allow this migration to run on plain PostgreSQL in CI.
DO $$
DECLARE client_role TEXT;
BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = client_role) THEN
      EXECUTE 'REVOKE ALL ON TABLE visit_events, visit_participants, visit_approval_requests, partnership_redemptions FROM ' || quote_ident(client_role);
    END IF;
  END LOOP;
END $$;
