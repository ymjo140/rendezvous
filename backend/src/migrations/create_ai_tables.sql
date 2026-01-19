-- AI 추천 시스템 테이블 생성
-- Supabase SQL Editor에서 실행하세요

-- =============================================
-- 1. user_actions: 사용자 행동 기록
-- =============================================
CREATE TABLE IF NOT EXISTS user_actions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    place_id INTEGER REFERENCES places(id) ON DELETE SET NULL,
    
    action_type VARCHAR(50) NOT NULL,  -- view, click, like, save, review, visit, share, search, reserve, dismiss, bad_review
    action_value FLOAT DEFAULT 1.0,
    weight_score INTEGER DEFAULT 1,
    
    context JSONB DEFAULT '{}'::jsonb,
    session_id VARCHAR(100),
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_user_actions_user_id ON user_actions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_actions_place_id ON user_actions(place_id);
CREATE INDEX IF NOT EXISTS idx_user_actions_type ON user_actions(action_type);
CREATE INDEX IF NOT EXISTS idx_user_actions_created_at ON user_actions(created_at DESC);

-- =============================================
-- 2. place_vectors: 장소 특성 벡터
-- =============================================
CREATE TABLE IF NOT EXISTS place_vectors (
    id SERIAL PRIMARY KEY,
    place_id INTEGER UNIQUE NOT NULL REFERENCES places(id) ON DELETE CASCADE,
    
    -- 특성 벡터 (0~1 정규화)
    price_level FLOAT DEFAULT 0.5,
    noise_level FLOAT DEFAULT 0.5,
    group_friendly FLOAT DEFAULT 0.5,
    date_friendly FLOAT DEFAULT 0.5,
    family_friendly FLOAT DEFAULT 0.5,
    solo_friendly FLOAT DEFAULT 0.5,
    
    -- 음식 카테고리 점수
    korean_score FLOAT DEFAULT 0.0,
    western_score FLOAT DEFAULT 0.0,
    japanese_score FLOAT DEFAULT 0.0,
    chinese_score FLOAT DEFAULT 0.0,
    cafe_score FLOAT DEFAULT 0.0,
    bar_score FLOAT DEFAULT 0.0,
    
    -- 분위기 점수
    trendy_score FLOAT DEFAULT 0.0,
    traditional_score FLOAT DEFAULT 0.0,
    cozy_score FLOAT DEFAULT 0.0,
    
    embedding JSONB DEFAULT '[]'::jsonb,
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_place_vectors_place_id ON place_vectors(place_id);

-- =============================================
-- 3. user_preference_vectors: 사용자 선호도 벡터
-- =============================================
CREATE TABLE IF NOT EXISTS user_preference_vectors (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- PlaceVector와 동일한 차원
    price_preference FLOAT DEFAULT 0.5,
    noise_preference FLOAT DEFAULT 0.5,
    group_preference FLOAT DEFAULT 0.5,
    date_preference FLOAT DEFAULT 0.5,
    family_preference FLOAT DEFAULT 0.5,
    solo_preference FLOAT DEFAULT 0.5,
    
    korean_preference FLOAT DEFAULT 0.0,
    western_preference FLOAT DEFAULT 0.0,
    japanese_preference FLOAT DEFAULT 0.0,
    chinese_preference FLOAT DEFAULT 0.0,
    cafe_preference FLOAT DEFAULT 0.0,
    bar_preference FLOAT DEFAULT 0.0,
    
    trendy_preference FLOAT DEFAULT 0.0,
    traditional_preference FLOAT DEFAULT 0.0,
    cozy_preference FLOAT DEFAULT 0.0,
    
    action_count INTEGER DEFAULT 0,
    last_updated TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_pref_user_id ON user_preference_vectors(user_id);

-- =============================================
-- 4. recommendation_logs: 추천 로그
-- =============================================
CREATE TABLE IF NOT EXISTS recommendation_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    algorithm VARCHAR(50) NOT NULL,  -- content, collaborative, hybrid, popular
    recommended_place_ids JSONB DEFAULT '[]'::jsonb,
    scores JSONB DEFAULT '[]'::jsonb,
    
    context JSONB DEFAULT '{}'::jsonb,
    
    clicked_place_id INTEGER,
    converted BOOLEAN DEFAULT false,
    
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rec_logs_user_id ON recommendation_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_rec_logs_created_at ON recommendation_logs(created_at DESC);

-- =============================================
-- 5. similar_places: 유사 장소 캐시
-- =============================================
CREATE TABLE IF NOT EXISTS similar_places (
    id SERIAL PRIMARY KEY,
    place_id INTEGER NOT NULL REFERENCES places(id) ON DELETE CASCADE,
    similar_place_id INTEGER NOT NULL REFERENCES places(id) ON DELETE CASCADE,
    similarity_score FLOAT NOT NULL,
    
    updated_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(place_id, similar_place_id)
);

CREATE INDEX IF NOT EXISTS idx_similar_places_place_id ON similar_places(place_id);
CREATE INDEX IF NOT EXISTS idx_similar_places_score ON similar_places(similarity_score DESC);

-- =============================================
-- 6. 샘플 장소 벡터 데이터 (테스트용)
-- =============================================
-- 기존 places 테이블에 데이터가 있다면, 해당 place_id를 사용해서 벡터 생성

INSERT INTO place_vectors (place_id, price_level, noise_level, group_friendly, date_friendly, solo_friendly, korean_score, cafe_score, trendy_score, cozy_score)
SELECT 
    id,
    CASE 
        WHEN category IN ('한식', '분식') THEN 0.3
        WHEN category IN ('양식', '일식') THEN 0.6
        WHEN category IN ('와인바', '파인다이닝') THEN 0.9
        ELSE 0.5
    END as price_level,
    CASE 
        WHEN category IN ('카페') THEN 0.3
        WHEN category IN ('술집', '바') THEN 0.7
        ELSE 0.5
    END as noise_level,
    CASE 
        WHEN category IN ('술집', '고깃집') THEN 0.8
        ELSE 0.5
    END as group_friendly,
    CASE 
        WHEN category IN ('양식', '와인바', '카페') THEN 0.8
        ELSE 0.4
    END as date_friendly,
    CASE 
        WHEN category IN ('분식', '한식', '카페') THEN 0.8
        ELSE 0.4
    END as solo_friendly,
    CASE WHEN category = '한식' THEN 1.0 ELSE 0.0 END as korean_score,
    CASE WHEN category = '카페' THEN 1.0 ELSE 0.0 END as cafe_score,
    0.5 as trendy_score,
    0.5 as cozy_score
FROM places
WHERE id NOT IN (SELECT place_id FROM place_vectors)
ON CONFLICT (place_id) DO NOTHING;

-- 완료 메시지
SELECT 'AI tables created successfully!' as result;
