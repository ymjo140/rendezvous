CREATE TABLE IF NOT EXISTS offers (
    id SERIAL PRIMARY KEY,
    place_id INTEGER NULL,
    title VARCHAR(255),
    description TEXT,
    benefit_type VARCHAR(50),
    benefit_value VARCHAR(50),
    conditions_json JSONB DEFAULT '{}'::jsonb,
    valid_from TIMESTAMP NULL,
    valid_to TIMESTAMP NULL,
    inventory_cap INTEGER DEFAULT 0,
    inventory_used INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_offers_place_id ON offers(place_id);
CREATE INDEX IF NOT EXISTS idx_offers_status ON offers(status);

CREATE TABLE IF NOT EXISTS offer_rules (
    id SERIAL PRIMARY KEY,
    place_id INTEGER NULL,
    rule_name VARCHAR(255),
    day_of_week_mask INTEGER DEFAULT 0,
    time_blocks_json JSONB DEFAULT '[]'::jsonb,
    party_size_min INTEGER DEFAULT 1,
    party_size_max INTEGER DEFAULT 10,
    lead_time_thresholds_json JSONB DEFAULT '{}'::jsonb,
    base_benefit_json JSONB DEFAULT '{}'::jsonb,
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_offer_rules_place_id ON offer_rules(place_id);

CREATE TABLE IF NOT EXISTS action_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NULL,
    action_type VARCHAR(50) NOT NULL,
    request_id VARCHAR(64),
    decision_cell_json JSONB DEFAULT '{}'::jsonb,
    entity_type VARCHAR(50),
    entity_id VARCHAR(64),
    metadata_json JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_action_logs_user_id ON action_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_action_logs_request_id ON action_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_action_logs_action_type ON action_logs(action_type);
