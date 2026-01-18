-- ============================================
-- WeMeet AI Vector Recommendation System Tables
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Enable pgvector extension (REQUIRED!)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Place embeddings table (real AI vectors)
CREATE TABLE IF NOT EXISTS place_embeddings (
    id SERIAL PRIMARY KEY,
    place_id INTEGER REFERENCES places(id) ON DELETE CASCADE,
    
    -- Text embedding (ko-sbert: 768 dim, Gemini: 768 dim)
    embedding vector(768),
    
    -- Embedding source text
    source_text TEXT,
    
    -- Metadata
    model_name VARCHAR(100) DEFAULT 'ko-sbert-nli',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(place_id)
);

-- 3. User preference embeddings table
CREATE TABLE IF NOT EXISTS user_embeddings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    
    -- User preference vector (learned from actions)
    preference_embedding vector(768),
    
    -- Recent interest vector (based on recent N actions)
    recent_embedding vector(768),
    
    -- Learning info
    action_count INTEGER DEFAULT 0,
    last_action_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(user_id)
);

-- 4. User interaction logs table (AI learning data)
CREATE TABLE IF NOT EXISTS user_interaction_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Interaction target
    place_id INTEGER REFERENCES places(id) ON DELETE SET NULL,
    post_id VARCHAR(36) REFERENCES posts(id) ON DELETE SET NULL,
    
    -- Interaction type
    action_type VARCHAR(50) NOT NULL,  -- VIEW, CLICK, LIKE, SAVE, SHARE, DISMISS, DWELL
    action_value FLOAT DEFAULT 1.0,     -- dwell time (sec), rating, etc
    
    -- Context (important for AI learning!)
    context JSONB DEFAULT '{}'::jsonb,  -- {"hour": 19, "day_of_week": 5, "weather": "clear", "companions": 2}
    
    -- Recommendation tracking
    recommendation_id INTEGER,  -- which recommendation was clicked
    position_in_list INTEGER,   -- position in the list
    
    -- Session tracking
    session_id VARCHAR(100),
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- 5. Recommendation results log (A/B testing and performance measurement)
CREATE TABLE IF NOT EXISTS recommendation_results (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Recommendation info
    algorithm_type VARCHAR(50) NOT NULL,  -- 'vector_similarity', 'collaborative', 'hybrid'
    model_version VARCHAR(50),
    
    -- Recommendation results
    recommended_place_ids INTEGER[] DEFAULT '{}',
    scores FLOAT[] DEFAULT '{}',
    
    -- Performance measurement
    clicked_place_id INTEGER,  -- actually clicked place
    clicked_position INTEGER,  -- click position
    
    -- Context
    context JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- 6. Create indexes (performance optimization)
CREATE INDEX IF NOT EXISTS idx_place_embeddings_place_id ON place_embeddings(place_id);
CREATE INDEX IF NOT EXISTS idx_user_embeddings_user_id ON user_embeddings(user_id);
CREATE INDEX IF NOT EXISTS idx_interaction_logs_user_id ON user_interaction_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_interaction_logs_place_id ON user_interaction_logs(place_id);
CREATE INDEX IF NOT EXISTS idx_interaction_logs_action ON user_interaction_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_interaction_logs_created ON user_interaction_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_recommendation_results_user ON recommendation_results(user_id);

-- 7. Vector similarity search index (IVFFlat - fast approximate search)
-- Recommended to enable after 1000+ records
-- CREATE INDEX ON place_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 8. Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_place_embeddings_updated_at ON place_embeddings;
CREATE TRIGGER update_place_embeddings_updated_at
    BEFORE UPDATE ON place_embeddings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_embeddings_updated_at ON user_embeddings;
CREATE TRIGGER update_user_embeddings_updated_at
    BEFORE UPDATE ON user_embeddings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Vector similarity search functions (pgvector)
-- ============================================

-- Place similarity search function
CREATE OR REPLACE FUNCTION search_similar_places(
    query_embedding vector(768),
    match_threshold FLOAT DEFAULT 0.7,
    match_count INT DEFAULT 10
)
RETURNS TABLE (
    place_id INTEGER,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pe.place_id,
        1 - (pe.embedding <=> query_embedding) as similarity
    FROM place_embeddings pe
    WHERE 1 - (pe.embedding <=> query_embedding) > match_threshold
    ORDER BY pe.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- User personalized recommendation function
CREATE OR REPLACE FUNCTION get_user_recommendations(
    target_user_id INTEGER,
    match_count INT DEFAULT 10
)
RETURNS TABLE (
    place_id INTEGER,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
DECLARE
    user_vector vector(768);
BEGIN
    -- Get user embedding
    SELECT preference_embedding INTO user_vector
    FROM user_embeddings
    WHERE user_id = target_user_id;
    
    -- Return empty if no embedding
    IF user_vector IS NULL THEN
        RETURN;
    END IF;
    
    -- Search similar places
    RETURN QUERY
    SELECT 
        pe.place_id,
        1 - (pe.embedding <=> user_vector) as similarity
    FROM place_embeddings pe
    ORDER BY pe.embedding <=> user_vector
    LIMIT match_count;
END;
$$;

-- ============================================
-- Completion message
-- ============================================
DO $$
BEGIN
    RAISE NOTICE 'AI Vector Recommendation System tables created successfully!';
    RAISE NOTICE 'Tables: place_embeddings, user_embeddings, user_interaction_logs, recommendation_results';
    RAISE NOTICE 'Functions: search_similar_places, get_user_recommendations';
END $$;
