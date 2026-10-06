-- 메추리 schema.sql (plan.md §2~§4, §6)
-- Supabase SQL Editor에서 실행. 여러 번 실행해도 에러 없게.

-- ---------------------------------------------------------------------------
-- 테이블
-- ---------------------------------------------------------------------------

create table if not exists public.places (
  id bigint generated always as identity primary key,
  kakao_place_id text not null unique,
  name text not null,
  address text not null,
  category text not null check (
    category in (
      '한식', '중식', '일식', '양식', '아시안', '분식', '치킨',
      '버거·피자', '샐러드·건강식', '카페·디저트', '술집', '기타'
    )
  ),
  kakao_category text not null,
  lat double precision not null,
  lng double precision not null,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);

create table if not exists public.ranking_lists (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id),
  is_onboarding boolean not null,
  created_at timestamptz not null default now()
);

create table if not exists public.ranking_items (
  id bigint generated always as identity primary key,
  list_id bigint not null references public.ranking_lists (id),
  user_id uuid not null default auth.uid() references auth.users (id),
  place_id bigint not null references public.places (id),
  rank integer not null check (rank >= 1 and rank <= 10),
  created_at timestamptz not null default now(),
  unique (list_id, place_id),
  unique (list_id, rank)
);

create table if not exists public.tags (
  id bigint generated always as identity primary key,
  group_key text not null,
  group_label text not null,
  group_kind text not null check (group_kind in ('descriptive', 'evaluative')),
  max_select integer not null,
  label text not null,
  parent_label text,
  value integer,
  sort integer not null,
  created_at timestamptz not null default now()
);

create table if not exists public.reviews (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id),
  place_id bigint not null references public.places (id),
  source text not null check (source in ('onboarding', 'review', 'list_add')),
  created_at timestamptz not null default now(),
  -- 한마디(선택). 200자 이하 + 공백 아닌 글자 1개 이상 (migrate_review_body.sql과 같은 조건)
  body text constraint reviews_body_length
    check (body is null or (char_length(body) <= 200 and body ~ '\S'))
);
-- ▸ body가 없던 기존 DB는 이 파일 대신 migrate_review_body.sql을 실행한다 (create table if not exists는 칸을 추가하지 않음)

create table if not exists public.review_tags (
  id bigint generated always as identity primary key,
  review_id bigint not null references public.reviews (id),
  user_id uuid not null default auth.uid() references auth.users (id),
  tag_id bigint not null references public.tags (id),
  created_at timestamptz not null default now(),
  unique (review_id, tag_id)
);

create table if not exists public.recommendations (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id),
  kind text not null check (kind in ('free', 'point', 'premium')),
  result_json text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id),
  amount integer not null,
  period_end timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  check (period_end <= created_at + interval '31 days')
);

-- ---------------------------------------------------------------------------
-- 권한
-- ---------------------------------------------------------------------------

grant select on table public.places, public.ranking_lists, public.ranking_items,
  public.tags, public.reviews, public.review_tags
  to anon, authenticated;

grant select on table public.recommendations, public.subscriptions to authenticated;

grant insert on table public.places, public.ranking_lists, public.ranking_items,
  public.reviews, public.review_tags, public.recommendations, public.subscriptions
  to authenticated;

grant usage, select on all sequences in schema public to authenticated;

-- ---------------------------------------------------------------------------
-- DB 함수 (§4-1)
-- ---------------------------------------------------------------------------

create or replace function public.save_list(
  p_place_ids bigint[],
  p_is_onboarding boolean
)
returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_list_id bigint;
  v_n integer;
begin
  v_n := coalesce(cardinality(p_place_ids), 0);
  if v_n < 3 or v_n > 10 then
    raise exception 'place count must be 3 to 10';
  end if;
  if array_position(p_place_ids, null) is not null then
    raise exception 'place_ids must not contain null';
  end if;
  if (select count(distinct x) from unnest(p_place_ids) as x) <> v_n then
    raise exception 'duplicate place_ids';
  end if;
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into public.ranking_lists (user_id, is_onboarding)
  values (auth.uid(), p_is_onboarding)
  returning id into v_list_id;

  insert into public.ranking_items (list_id, user_id, place_id, rank)
  select v_list_id, auth.uid(), p_place_ids[i], i
  from generate_subscripts(p_place_ids, 1) as i;

  return v_list_id;
end;
$$;

-- 인자가 다른 옛 3인자 버전이 남아 있으면 PostgREST 호출이 헷갈리므로 지운다
drop function if exists public.submit_review(bigint, bigint[], text);

create or replace function public.submit_review(
  p_place_id bigint,
  p_tag_ids bigint[],
  p_source text,
  p_body text default null
)
returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_review_id bigint;
  v_n integer;
  v_body text;
begin
  v_n := coalesce(cardinality(p_tag_ids), 0);
  if v_n < 1 then
    raise exception 'at least one tag required';
  end if;
  if p_source not in ('onboarding', 'review', 'list_add') then
    raise exception 'invalid source';
  end if;
  if array_position(p_tag_ids, null) is not null then
    raise exception 'tag_ids must not contain null';
  end if;
  if (select count(distinct x) from unnest(p_tag_ids) as x) <> v_n then
    raise exception 'duplicate tag_ids';
  end if;
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- 앞뒤 공백(줄바꿈 포함)을 자르고, 빈 문자열이면 null. 200자 초과·공백만은 reviews_body_length가 막는다
  v_body := nullif(regexp_replace(p_body, '^\s+|\s+$', '', 'g'), '');

  insert into public.reviews (user_id, place_id, source, body)
  values (auth.uid(), p_place_id, p_source, v_body)
  returning id into v_review_id;

  insert into public.review_tags (review_id, user_id, tag_id)
  select v_review_id, auth.uid(), t.tag_id
  from unnest(p_tag_ids) as t(tag_id);

  return v_review_id;
end;
$$;

revoke all on function public.save_list(bigint[], boolean) from public;
revoke all on function public.submit_review(bigint, bigint[], text, text) from public;
grant execute on function public.save_list(bigint[], boolean) to authenticated;
grant execute on function public.submit_review(bigint, bigint[], text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS (§4) — select·insert만. update·delete 정책 없음
-- ---------------------------------------------------------------------------

alter table public.places enable row level security;
alter table public.ranking_lists enable row level security;
alter table public.ranking_items enable row level security;
alter table public.tags enable row level security;
alter table public.reviews enable row level security;
alter table public.review_tags enable row level security;
alter table public.recommendations enable row level security;
alter table public.subscriptions enable row level security;

drop policy if exists places_select on public.places;
create policy places_select on public.places
  for select to anon, authenticated
  using (true);

drop policy if exists places_insert on public.places;
create policy places_insert on public.places
  for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists ranking_lists_select on public.ranking_lists;
create policy ranking_lists_select on public.ranking_lists
  for select to anon, authenticated
  using (true);

drop policy if exists ranking_lists_insert on public.ranking_lists;
create policy ranking_lists_insert on public.ranking_lists
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists ranking_items_select on public.ranking_items;
create policy ranking_items_select on public.ranking_items
  for select to anon, authenticated
  using (true);

drop policy if exists ranking_items_insert on public.ranking_items;
create policy ranking_items_insert on public.ranking_items
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.ranking_lists
      where id = ranking_items.list_id and user_id = auth.uid()
    )
  );

drop policy if exists tags_select on public.tags;
create policy tags_select on public.tags
  for select to anon, authenticated
  using (true);

drop policy if exists reviews_select on public.reviews;
create policy reviews_select on public.reviews
  for select to anon, authenticated
  using (true);

drop policy if exists reviews_insert on public.reviews;
create policy reviews_insert on public.reviews
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists review_tags_select on public.review_tags;
create policy review_tags_select on public.review_tags
  for select to anon, authenticated
  using (true);

drop policy if exists review_tags_insert on public.review_tags;
create policy review_tags_insert on public.review_tags
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.reviews
      where id = review_tags.review_id and user_id = auth.uid()
    )
  );

drop policy if exists recommendations_select on public.recommendations;
create policy recommendations_select on public.recommendations
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists recommendations_insert on public.recommendations;
create policy recommendations_insert on public.recommendations
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists subscriptions_select on public.subscriptions;
create policy subscriptions_select on public.subscriptions
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists subscriptions_insert on public.subscriptions;
create policy subscriptions_insert on public.subscriptions
  for insert to authenticated
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- tags 시드 (§6) — 72행. 재실행 시 (group_key, label)이 있으면 건너뜀
-- ---------------------------------------------------------------------------

insert into public.tags (
  group_key, group_label, group_kind, max_select, label, parent_label, value, sort
)
select v.group_key, v.group_label, v.group_kind, v.max_select, v.label,
       v.parent_label, v.value, v.sort
from (
  values
    -- cuisine (30) parent_label = 대분류
    ('cuisine', '음식 종류', 'descriptive', 2, '국밥·해장국', '한식', null::integer, 1),
    ('cuisine', '음식 종류', 'descriptive', 2, '찌개·백반', '한식', null, 2),
    ('cuisine', '음식 종류', 'descriptive', 2, '고기·구이', '한식', null, 3),
    ('cuisine', '음식 종류', 'descriptive', 2, '면·칼국수', '한식', null, 4),
    ('cuisine', '음식 종류', 'descriptive', 2, '족발·보쌈', '한식', null, 5),
    ('cuisine', '음식 종류', 'descriptive', 2, '찜·탕', '한식', null, 6),
    ('cuisine', '음식 종류', 'descriptive', 2, '짜장·짬뽕', '중식', null, 7),
    ('cuisine', '음식 종류', 'descriptive', 2, '마라', '중식', null, 8),
    ('cuisine', '음식 종류', 'descriptive', 2, '양꼬치', '중식', null, 9),
    ('cuisine', '음식 종류', 'descriptive', 2, '돈까스', '일식', null, 10),
    ('cuisine', '음식 종류', 'descriptive', 2, '초밥·회', '일식', null, 11),
    ('cuisine', '음식 종류', 'descriptive', 2, '라멘·우동', '일식', null, 12),
    ('cuisine', '음식 종류', 'descriptive', 2, '덮밥', '일식', null, 13),
    ('cuisine', '음식 종류', 'descriptive', 2, '파스타', '양식', null, 14),
    ('cuisine', '음식 종류', 'descriptive', 2, '스테이크', '양식', null, 15),
    ('cuisine', '음식 종류', 'descriptive', 2, '브런치', '양식', null, 16),
    ('cuisine', '음식 종류', 'descriptive', 2, '쌀국수', '아시안', null, 17),
    ('cuisine', '음식 종류', 'descriptive', 2, '태국', '아시안', null, 18),
    ('cuisine', '음식 종류', 'descriptive', 2, '인도·커리', '아시안', null, 19),
    ('cuisine', '음식 종류', 'descriptive', 2, '떡볶이', '분식', null, 20),
    ('cuisine', '음식 종류', 'descriptive', 2, '김밥', '분식', null, 21),
    ('cuisine', '음식 종류', 'descriptive', 2, '치킨', '치킨', null, 22),
    ('cuisine', '음식 종류', 'descriptive', 2, '버거', '버거·피자', null, 23),
    ('cuisine', '음식 종류', 'descriptive', 2, '피자', '버거·피자', null, 24),
    ('cuisine', '음식 종류', 'descriptive', 2, '샐러드·포케', '샐러드·건강식', null, 25),
    ('cuisine', '음식 종류', 'descriptive', 2, '커피', '카페·디저트', null, 26),
    ('cuisine', '음식 종류', 'descriptive', 2, '베이커리·디저트', '카페·디저트', null, 27),
    ('cuisine', '음식 종류', 'descriptive', 2, '호프', '술집', null, 28),
    ('cuisine', '음식 종류', 'descriptive', 2, '이자카야', '술집', null, 29),
    ('cuisine', '음식 종류', 'descriptive', 2, '포차', '술집', null, 30),
    -- taste (10)
    ('taste', '맛 스타일', 'descriptive', 3, '매운', null, null, 1),
    ('taste', '맛 스타일', 'descriptive', 3, '얼큰한', null, null, 2),
    ('taste', '맛 스타일', 'descriptive', 3, '담백한', null, null, 3),
    ('taste', '맛 스타일', 'descriptive', 3, '짭짤한', null, null, 4),
    ('taste', '맛 스타일', 'descriptive', 3, '달달한', null, null, 5),
    ('taste', '맛 스타일', 'descriptive', 3, '고소한', null, null, 6),
    ('taste', '맛 스타일', 'descriptive', 3, '진한', null, null, 7),
    ('taste', '맛 스타일', 'descriptive', 3, '느끼한', null, null, 8),
    ('taste', '맛 스타일', 'descriptive', 3, '자극적인', null, null, 9),
    ('taste', '맛 스타일', 'descriptive', 3, '깔끔한', null, null, 10),
    -- mood (6)
    ('mood', '분위기', 'descriptive', 2, '아늑한', null, null, 1),
    ('mood', '분위기', 'descriptive', 2, '세련된', null, null, 2),
    ('mood', '분위기', 'descriptive', 2, '시끌벅적한', null, null, 3),
    ('mood', '분위기', 'descriptive', 2, '조용한', null, null, 4),
    ('mood', '분위기', 'descriptive', 2, '감성적인', null, null, 5),
    ('mood', '분위기', 'descriptive', 2, '노포', null, null, 6),
    -- situation (8)
    ('situation', '상황', 'descriptive', 3, '데이트', null, null, 1),
    ('situation', '상황', 'descriptive', 3, '밥약', null, null, 2),
    ('situation', '상황', 'descriptive', 3, '혼밥', null, null, 3),
    ('situation', '상황', 'descriptive', 3, '단체·회식', null, null, 4),
    ('situation', '상황', 'descriptive', 3, '술자리', null, null, 5),
    ('situation', '상황', 'descriptive', 3, '손님 대접', null, null, 6),
    ('situation', '상황', 'descriptive', 3, '빠른 한 끼', null, null, 7),
    ('situation', '상황', 'descriptive', 3, '해장', null, null, 8),
    -- price (3)
    ('price', '가격대', 'descriptive', 1, '1인 1만 원 이하', null, null, 1),
    ('price', '가격대', 'descriptive', 1, '1~2만 원', null, null, 2),
    ('price', '가격대', 'descriptive', 1, '2만 원 이상', null, null, 3),
    -- evaluative (5×3)
    ('clean', '청결도', 'evaluative', 1, '깨끗함', null, 1, 1),
    ('clean', '청결도', 'evaluative', 1, '보통', null, 0, 2),
    ('clean', '청결도', 'evaluative', 1, '아쉬움', null, -1, 3),
    ('kind', '친절', 'evaluative', 1, '친절함', null, 1, 1),
    ('kind', '친절', 'evaluative', 1, '보통', null, 0, 2),
    ('kind', '친절', 'evaluative', 1, '아쉬움', null, -1, 3),
    ('value', '가성비', 'evaluative', 1, '좋음', null, 1, 1),
    ('value', '가성비', 'evaluative', 1, '보통', null, 0, 2),
    ('value', '가성비', 'evaluative', 1, '비쌈', null, -1, 3),
    ('portion', '양', 'evaluative', 1, '푸짐', null, 1, 1),
    ('portion', '양', 'evaluative', 1, '보통', null, 0, 2),
    ('portion', '양', 'evaluative', 1, '적음', null, -1, 3),
    ('wait', '대기', 'evaluative', 1, '바로 입장', null, 1, 1),
    ('wait', '대기', 'evaluative', 1, '조금 대기', null, 0, 2),
    ('wait', '대기', 'evaluative', 1, '오래 대기', null, -1, 3)
) as v(group_key, group_label, group_kind, max_select, label, parent_label, value, sort)
where not exists (
  select 1 from public.tags t
  where t.group_key = v.group_key and t.label = v.label
);
