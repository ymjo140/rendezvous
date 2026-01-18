-- Places table schema upgrade
-- Add hierarchical category structure for better filtering

-- Add new columns (if not exists)
ALTER TABLE places ADD COLUMN IF NOT EXISTS main_category VARCHAR(50) DEFAULT 'FOOD';
ALTER TABLE places ADD COLUMN IF NOT EXISTS cuisine_type VARCHAR(100);
ALTER TABLE places ADD COLUMN IF NOT EXISTS vibe_tags JSONB DEFAULT '[]'::jsonb;
ALTER TABLE places ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '{}'::jsonb;
ALTER TABLE places ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE places ADD COLUMN IF NOT EXISTS business_hours VARCHAR(200);
ALTER TABLE places ADD COLUMN IF NOT EXISTS price_range VARCHAR(20);
ALTER TABLE places ADD COLUMN IF NOT EXISTS search_keywords JSONB DEFAULT '[]'::jsonb;

-- Create indexes for fast filtering
CREATE INDEX IF NOT EXISTS idx_places_main_category ON places(main_category);
CREATE INDEX IF NOT EXISTS idx_places_cuisine_type ON places(cuisine_type);
CREATE INDEX IF NOT EXISTS idx_places_features ON places USING GIN(features);
CREATE INDEX IF NOT EXISTS idx_places_vibe_tags ON places USING GIN(vibe_tags);
CREATE INDEX IF NOT EXISTS idx_places_search_keywords ON places USING GIN(search_keywords);

-- Index for location-based queries
CREATE INDEX IF NOT EXISTS idx_places_lat_lng ON places(lat, lng);

-- Comment on columns
COMMENT ON COLUMN places.main_category IS 'L1: FOOD, CAFE, PUB, ACTIVITY';
COMMENT ON COLUMN places.cuisine_type IS 'L2: 한식, 양식, 일식, 중식, 카페, 바 등';
COMMENT ON COLUMN places.vibe_tags IS 'L3: 분위기/목적 태그 ["데이트", "회식", "조용한"]';
COMMENT ON COLUMN places.features IS 'L4: 시설 정보 {"parking": true, "wifi": true}';
