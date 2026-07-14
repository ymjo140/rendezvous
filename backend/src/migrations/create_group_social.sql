-- 맛집 모임 (소셜 #6) — 채팅 모임(Community)을 공개 수준별로 탐색에 노출.
-- 안전: add column if not exists / create table if not exists → 재실행 무해.

-- 1) 모임 공개 수준 + 대표 아이콘 (기본 private = 아무 노출 없음)
alter table communities add column if not exists visibility text default 'private';
alter table communities add column if not exists icon text;

-- 2) 폴더를 모임 소유로 (개인 폴더면 null)
alter table save_folders add column if not exists community_id text references communities(id);
create index if not exists ix_save_folders_community on save_folders(community_id);

-- 3) 모임 팔로우 (백엔드만 접근, 정책없이 RLS enable = anon 차단)
create table if not exists community_follows (
    id           serial primary key,
    follower_id  integer not null references users(id),
    community_id text not null references communities(id),
    created_at   timestamp default now(),
    constraint uq_community_follow unique (follower_id, community_id)
);
create index if not exists ix_community_follows_follower  on community_follows(follower_id);
create index if not exists ix_community_follows_community on community_follows(community_id);
alter table community_follows enable row level security;
