-- Location-only user check-in upgrade.
-- Keep legacy QR/merchant evidence readable; new consumer check-ins use location.
DO $$
BEGIN
  IF to_regclass('visit_participants') IS NULL THEN
    RAISE EXCEPTION 'visit_participants must exist before applying location check-in upgrade';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'visit_participants'::regclass
       AND conname = 'ck_visit_evidence'
  ) THEN
    ALTER TABLE visit_participants DROP CONSTRAINT ck_visit_evidence;
  END IF;

  ALTER TABLE visit_participants
    ADD CONSTRAINT ck_visit_evidence
    CHECK (evidence_type IN ('location', 'signed_qr', 'merchant_approval'));
END $$;
