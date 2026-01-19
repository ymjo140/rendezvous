ALTER TABLE users
ADD COLUMN IF NOT EXISTS ml_status VARCHAR DEFAULT 'STARTER',
ADD COLUMN IF NOT EXISTS interaction_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS blacklisted_place_ids JSONB DEFAULT '[]'::jsonb;

ALTER TABLE user_actions
ADD COLUMN IF NOT EXISTS weight_score INTEGER DEFAULT 1;

UPDATE users
SET ml_status = 'STARTER'
WHERE ml_status IS NULL;

UPDATE users
SET interaction_score = 0
WHERE interaction_score IS NULL;

UPDATE users
SET blacklisted_place_ids = '[]'::jsonb
WHERE blacklisted_place_ids IS NULL;

UPDATE user_actions
SET weight_score = 1
WHERE weight_score IS NULL;
