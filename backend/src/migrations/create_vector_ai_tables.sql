-- ============================================
-- WeMeet AI 벡터 추천 시스템 테이블 생성
-- Supabase SQL Editor에서 실행하세요
-- ============================================

-- 1. pgvector 확장 활성화 (필수!)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. 장소 임베딩 테이블 (진짜 AI 벡터 저장)
CREATE TABLE IF NOT EXISTS place_embeddings (
    id SERIAL PRIMARY KEY,
    place_id INTEGER REFERENCES places(id) ON DELETE CASCADE,
    
    -- 텍스트 임베딩 (OpenAI text-embedding-3-small: 1536차원)
    -- 또는 한국어 모델 (ko-sbert: 768차원)
    embedding vector(768),  -- 한국어 모델 기준 (나중에 조정 가능)
    
    -- 임베딩 소스 텍스트
    source_text TEXT,  -- "카페 | 강남역 | 조용한, 작업하기좋은, 디저트맛집"
    
    -- 메타데이터
    model_name VARCHAR(100) DEFAULT 'ko-sbert-nli',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(place_id)
);

-- 3. 유저 취향 임베딩 테이블
CREATE TABLE IF NOT EXISTS user_embeddings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    
    -- 유저 취향 벡터 (행동 기반으로 학습)
    preference_embedding vector(768),
    
    -- 최근 관심사 벡터 (최근 N개 행동 기반)
    recent_embedding vector(768),
    
    -- 학습 정보
    action_count INTEGER DEFAULT 0,
    last_action_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(user_id)
);

-- 4. 유저 상호작용 로그 테이블 (AI 학습 데이터)
CREATE TABLE IF NOT EXISTS user_interaction_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- 상호작용 대상
    place_id INTEGER REFERENCES places(id) ON DELETE SET NULL,
    post_id VARCHAR(36) REFERENCES posts(id) ON DELETE SET NULL,
    
    -- 상호작용 유형
    action_type VARCHAR(50) NOT NULL,  -- VIEW, CLICK, LIKE, SAVE, SHARE, DISMISS, DWELL
    action_value FLOAT DEFAULT 1.0,     -- 체류 시간(초), 평점 등
    
    -- 컨텍스트 (AI 학습에 중요!)
    context JSONB DEFAULT '{}'::jsonb,  -- {"hour": 19, "day_of_week": 5, "weather": "clear", "companions": 2}
    
    -- 추천 관련
    recommendation_id INTEGER,  -- 어떤 추천에서 클릭했는지
    position_in_list INTEGER,   -- 리스트에서 몇 번째였는지
    
    -- 세션 추적
    session_id VARCHAR(100),
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- 5. 추천 결과 로그 (A/B 테스트 및 성능 측정용)
CREATE TABLE IF NOT EXISTS recommendation_results (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- 추천 정보
    algorithm_type VARCHAR(50) NOT NULL,  -- 'vector_similarity', 'collaborative', 'hybrid'
    model_version VARCHAR(50),
    
    -- 추천 결과
    recommended_place_ids INTEGER[] DEFAULT '{}',
    scores FLOAT[] DEFAULT '{}',
    
    -- 성과 측정
    clicked_place_id INTEGER,  -- 실제 클릭한 장소
    clicked_position INTEGER,  -- 클릭한 위치
    
    -- 컨텍스트
    context JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- 6. 인덱스 생성 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_place_embeddings_place_id ON place_embeddings(place_id);
CREATE INDEX IF NOT EXISTS idx_user_embeddings_user_id ON user_embeddings(user_id);
CREATE INDEX IF NOT EXISTS idx_interaction_logs_user_id ON user_interaction_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_interaction_logs_place_id ON user_interaction_logs(place_id);
CREATE INDEX IF NOT EXISTS idx_interaction_logs_action ON user_interaction_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_interaction_logs_created ON user_interaction_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_recommendation_results_user ON recommendation_results(user_id);

-- 7. 벡터 유사도 검색용 인덱스 (IVFFlat - 빠른 근사 검색)
-- 데이터가 1000개 이상 쌓이면 활성화 권장
-- CREATE INDEX ON place_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 8. updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_place_embeddings_updated_at
    BEFORE UPDATE ON place_embeddings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_embeddings_updated_at
    BEFORE UPDATE ON user_embeddings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 벡터 유사도 검색 함수 (pgvector 활용)
-- ============================================

-- 장소 유사도 검색 함수
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

-- 유저 맞춤 추천 함수
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
    -- 유저 임베딩 가져오기
    SELECT preference_embedding INTO user_vector
    FROM user_embeddings
    WHERE user_id = target_user_id;
    
    -- 임베딩이 없으면 빈 결과 반환
    IF user_vector IS NULL THEN
        RETURN;
    END IF;
    
    -- 유사한 장소 검색
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
-- 완료 메시지
-- ============================================
DO $$
BEGIN
    RAISE NOTICE '✅ AI 벡터 추천 시스템 테이블 생성 완료!';
    RAISE NOTICE '📊 생성된 테이블: place_embeddings, user_embeddings, user_interaction_logs, recommendation_results';
    RAISE NOTICE '🔍 생성된 함수: search_similar_places, get_user_recommendations';
END $$;
