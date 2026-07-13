-- 큐레이터 팔로우 + 공개 '맛집 리스트' (소셜 디스커버리 #2)
-- 안전: create table if not exists / add column if not exists → 재실행 무해.
-- RLS: user_follows는 백엔드(DATABASE_URL)만 접근, 정책 없이 enable → anon 전면 차단.

-- 1) 단방향 팔로우 (친구 friendships와 별개; 인스타 팔로우 개념)
create table if not exists user_follows (
    id           serial primary key,
    follower_id  integer not null references users(id),
    following_id integer not null references users(id),
    created_at   timestamp default now(),
    constraint uq_user_follow unique (follower_id, following_id)
);
create index if not exists ix_user_follows_follower  on user_follows(follower_id);
create index if not exists ix_user_follows_following on user_follows(following_id);
alter table user_follows enable row level security;

-- 2) 저장 폴더 → 공개 맛집 리스트로 승격 가능
alter table save_folders add column if not exists is_public   boolean default false;
alter table save_folders add column if not exists description text;
