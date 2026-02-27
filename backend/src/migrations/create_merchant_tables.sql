-- =========================================================
-- Merchant / B2B Console Tables
-- Depends on existing tables:
--   users(id)
--   places(id)
-- =========================================================

-- 1. Merchant profile (사장님 계정 메타)
CREATE TABLE IF NOT EXISTS merchant_profiles (
    merchant_user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    display_name TEXT,
    phone TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Store membership (가게-유저 권한 매핑)
CREATE TABLE IF NOT EXISTS store_memberships (
    id SERIAL PRIMARY KEY,
    place_id INTEGER NOT NULL REFERENCES places(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'staff')),
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'pending', 'invited')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (place_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_store_memberships_place
    ON store_memberships(place_id);

CREATE INDEX IF NOT EXISTS idx_store_memberships_user
    ON store_memberships(user_id);

-- 3. Benefits catalog (혜택 사전)
CREATE TABLE IF NOT EXISTS offer_benefits_catalog (
    id SERIAL PRIMARY KEY,
    place_id INTEGER REFERENCES places(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (
        type IN (
            'percentage_discount',
            'fixed_discount',
            'free_item',
            'set_menu',
            'other'
        )
    ),
    title TEXT NOT NULL,
    metadata JSONB,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_benefits_place
    ON offer_benefits_catalog(place_id);

-- 4. Offer rules (핵심: 사전 조건 기반 규칙)
CREATE TABLE IF NOT EXISTS offer_rules (
    id SERIAL PRIMARY KEY,
    place_id INTEGER NOT NULL REFERENCES places(id) ON DELETE CASCADE,

    name TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,

    -- 조건
    day_of_week_mask INTEGER NOT NULL, -- bitmask: Mon=1 ... Sun=64
    time_blocks JSONB NOT NULL,         -- [{ "start": "18:00", "end": "20:00" }]

    party_size_min INTEGER,
    party_size_max INTEGER,

    lead_time_min_minutes INTEGER,
    lead_time_max_minutes INTEGER,

    -- 혜택
    benefit_id INTEGER REFERENCES offer_benefits_catalog(id),
    benefit_value JSONB NOT NULL,       -- { "percent": 10 } 등

    -- 가드레일
    guardrails JSONB,                   -- { "daily_cap": 20, "min_spend": 30000 }

    priority INTEGER NOT NULL DEFAULT 0,

    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_offer_rules_place
    ON offer_rules(place_id);

CREATE INDEX IF NOT EXISTS idx_offer_rules_enabled
    ON offer_rules(place_id, enabled);

-- 5. Offer rule versions (변경 이력 / 분석용)
CREATE TABLE IF NOT EXISTS offer_rule_versions (
    id SERIAL PRIMARY KEY,
    rule_id INTEGER NOT NULL REFERENCES offer_rules(id) ON DELETE CASCADE,
    snapshot JSONB NOT NULL,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_offer_rule_versions_rule
    ON offer_rule_versions(rule_id);
