-- 맛집 리스트 추천(좋아요) + 댓글 (소셜 #4)
-- 안전: create table if not exists → 재실행 무해. RLS enable(정책없음=anon차단, 백엔드만).

create table if not exists list_likes (
    id         serial primary key,
    folder_id  integer not null references save_folders(id) on delete cascade,
    user_id    integer not null references users(id),
    created_at timestamp default now(),
    constraint uq_list_like unique (folder_id, user_id)
);
create index if not exists ix_list_likes_folder on list_likes(folder_id);
create index if not exists ix_list_likes_user   on list_likes(user_id);
alter table list_likes enable row level security;

create table if not exists list_comments (
    id         serial primary key,
    folder_id  integer not null references save_folders(id) on delete cascade,
    user_id    integer not null references users(id),
    content    text not null,
    created_at timestamp default now()
);
create index if not exists ix_list_comments_folder on list_comments(folder_id);
alter table list_comments enable row level security;
