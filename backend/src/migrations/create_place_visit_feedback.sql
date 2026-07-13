-- 재방문 의향 설문 (개인 취향 + 모임 적합 2축). 기존 테이블 미변경, 추가만.
create table if not exists public.place_visit_feedback (
  id serial primary key,
  user_id integer not null references public.users(id) on delete cascade,
  place_id integer,
  reservation_id text,
  room_id text,
  personal_revisit boolean,
  group_revisit boolean,
  created_at timestamp default now()
);

create index if not exists idx_pvf_user on public.place_visit_feedback(user_id);
create index if not exists idx_pvf_place on public.place_visit_feedback(place_id);
create index if not exists idx_pvf_resv on public.place_visit_feedback(reservation_id);

-- B2C 전용(백엔드=DATABASE_URL 직결로 접근, RLS 우회). anon REST 직접 접근만 차단.
alter table public.place_visit_feedback enable row level security;
