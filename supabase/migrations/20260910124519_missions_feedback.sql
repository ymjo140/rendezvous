-- Additive week 3: provenance and attendee feedback; never promote legacy records.

CREATE TABLE IF NOT EXISTS list_copy_events (
	id VARCHAR NOT NULL,
	source_folder_id INTEGER,
	source_community_id VARCHAR,
	destination_folder_id INTEGER,
	destination_community_id VARCHAR,
	user_id INTEGER NOT NULL,
	added_count INTEGER NOT NULL,
	creditable BOOLEAN NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_list_copy_destination UNIQUE (source_folder_id, destination_folder_id, user_id),
	CONSTRAINT ck_list_copy_added CHECK (added_count > 0),
	CONSTRAINT ck_list_copy_scope CHECK (NOT creditable OR (source_community_id IS NOT NULL AND destination_community_id IS NOT NULL AND source_community_id <> destination_community_id)),
	FOREIGN KEY(source_folder_id) REFERENCES save_folders (id) ON DELETE SET NULL,
	FOREIGN KEY(destination_folder_id) REFERENCES save_folders (id) ON DELETE SET NULL,
	FOREIGN KEY(user_id) REFERENCES users (id)
)

;
CREATE INDEX IF NOT EXISTS ix_list_copy_mission ON list_copy_events (destination_community_id, user_id, created_at);
CREATE INDEX IF NOT EXISTS ix_list_copy_target ON list_copy_events (destination_folder_id);
CREATE INDEX IF NOT EXISTS ix_list_copy_user ON list_copy_events (user_id);
ALTER TABLE list_copy_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS verified_visit_feedback (
	id VARCHAR NOT NULL,
	visit_id VARCHAR NOT NULL,
	user_id INTEGER NOT NULL,
	personal_revisit BOOLEAN NOT NULL,
	group_revisit BOOLEAN,
	dislike_reason VARCHAR(32),
	review_id INTEGER,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_verified_feedback_user UNIQUE (visit_id, user_id),
	FOREIGN KEY(visit_id) REFERENCES visit_events (id),
	FOREIGN KEY(user_id) REFERENCES users (id),
	UNIQUE (review_id),
	FOREIGN KEY(review_id) REFERENCES reviews (id)
)

;
CREATE INDEX IF NOT EXISTS ix_verified_feedback_user_created ON verified_visit_feedback (user_id, created_at);
ALTER TABLE verified_visit_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_embeddings ADD COLUMN IF NOT EXISTS computed_at TIMESTAMP WITH TIME ZONE;
DO $$
DECLARE client_role TEXT;
BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = client_role) THEN
      EXECUTE 'REVOKE ALL ON TABLE list_copy_events, verified_visit_feedback FROM ' || quote_ident(client_role);
    END IF;
  END LOOP;
END $$;
