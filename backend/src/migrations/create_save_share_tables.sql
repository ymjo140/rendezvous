-- 저장 폴더 및 공유 시스템 테이블 생성
-- Supabase SQL Editor에서 실행하세요

-- =============================================
-- 1. save_folders: 저장 폴더
-- =============================================
CREATE TABLE IF NOT EXISTS save_folders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    icon VARCHAR(10) DEFAULT '📁',
    color VARCHAR(20) DEFAULT '#7C3AED',
    is_default BOOLEAN DEFAULT false,
    item_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_save_folders_user_id ON save_folders(user_id);

-- =============================================
-- 2. saved_items: 폴더 내 저장 아이템
-- =============================================
CREATE TABLE IF NOT EXISTS saved_items (
    id SERIAL PRIMARY KEY,
    folder_id INTEGER NOT NULL REFERENCES save_folders(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    item_type VARCHAR(20) NOT NULL,  -- 'post' 또는 'place'
    post_id VARCHAR(36) REFERENCES posts(id) ON DELETE CASCADE,
    place_id INTEGER REFERENCES places(id) ON DELETE CASCADE,
    
    memo TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    
    -- 같은 폴더에 같은 아이템 중복 방지
    UNIQUE(folder_id, item_type, post_id),
    UNIQUE(folder_id, item_type, place_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_items_folder_id ON saved_items(folder_id);
CREATE INDEX IF NOT EXISTS idx_saved_items_user_id ON saved_items(user_id);

-- =============================================
-- 3. share_carts: 공유 담기 장바구니
-- =============================================
CREATE TABLE IF NOT EXISTS share_carts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    item_type VARCHAR(20) NOT NULL,
    post_id VARCHAR(36) REFERENCES posts(id) ON DELETE CASCADE,
    place_id INTEGER REFERENCES places(id) ON DELETE CASCADE,
    
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_share_carts_user_id ON share_carts(user_id);

-- =============================================
-- 4. shared_messages: 공유된 메시지
-- =============================================
CREATE TABLE IF NOT EXISTS shared_messages (
    id SERIAL PRIMARY KEY,
    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    room_id VARCHAR(36) NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
    
    shared_items JSONB DEFAULT '[]'::jsonb,
    message TEXT,
    
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shared_messages_room_id ON shared_messages(room_id);
CREATE INDEX IF NOT EXISTS idx_shared_messages_sender_id ON shared_messages(sender_id);

-- =============================================
-- 5. post_saves 테이블 (기존 테이블 - 없으면 생성)
-- =============================================
CREATE TABLE IF NOT EXISTS post_saves (
    id SERIAL PRIMARY KEY,
    post_id VARCHAR(36) NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_post_saves_post_id ON post_saves(post_id);
CREATE INDEX IF NOT EXISTS idx_post_saves_user_id ON post_saves(user_id);

-- =============================================
-- 6. 업데이트 트리거
-- =============================================
CREATE OR REPLACE FUNCTION update_save_folder_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_save_folders_updated_at ON save_folders;
CREATE TRIGGER update_save_folders_updated_at
    BEFORE UPDATE ON save_folders
    FOR EACH ROW
    EXECUTE FUNCTION update_save_folder_timestamp();

-- 완료 메시지
SELECT 'Save and Share tables created successfully!' as result;
