-- 메추리 migrate_review_body.sql — 리뷰 '한마디' 글 (plan.md §3 reviews.body, §4-1 submit_review)
--
-- 언제: 2026-10-06 작성. schema.sql을 이미 실행한 DB에서 Supabase SQL Editor로 한 번 실행한다.
--       여러 번 실행해도 에러 없게 만들었다.
-- 왜:   리뷰 시트에 선택 입력 '한마디'(최대 200자)를 넣고, 가게 상세에 최근 한마디를 보여주기 위해
--       1) reviews에 body 칸을 추가하고
--       2) submit_review가 마지막 인자 p_body를 받아 같은 트랜잭션에서 저장하게 한다.
--       인자가 다른 옛 함수가 남아 있으면 PostgREST 호출이 헷갈리므로 옛 3인자 함수는 지우고 새로 만든다.
--       schema.sql도 같은 모양(body 칸·제약, 4인자 submit_review)으로 맞춰 두었다 → 새 DB는 schema.sql만 돌리면 된다.
-- 되돌리기 (한마디 글 데이터도 함께 지워진다):
--   begin;
--   drop function if exists public.submit_review(bigint, bigint[], text, text);
--   -- 옛 3인자 submit_review(create or replace ~ revoke/grant 두 줄)를 다시 실행.
--   --   schema.sql은 이제 4인자라 옛 정의는 git에서 꺼낸다: git show 023b0ad:schema.sql
--   alter table public.reviews drop constraint if exists reviews_body_length;
--   alter table public.reviews drop column if exists body;
--   commit;
--   notify pgrst, 'reload schema';
--   → 앱 코드도 함께 되돌린다 (한마디를 쓰면 p_body를 넘기므로 3인자 함수에서는 실패한다)

begin;

-- ---------------------------------------------------------------------------
-- 1. reviews.body — null 허용, 값이 있으면 200자 이하 + 공백 아닌 글자 1개 이상
--    제약은 지우고 다시 만든다 (여러 번 돌려도 마지막 조건 하나만 남는다)
-- ---------------------------------------------------------------------------

alter table public.reviews add column if not exists body text;

alter table public.reviews drop constraint if exists reviews_body_length;
alter table public.reviews
  add constraint reviews_body_length
  check (body is null or (char_length(body) <= 200 and body ~ '\S'));

-- ---------------------------------------------------------------------------
-- 2. submit_review(p_place_id, p_tag_ids, p_source, p_body default null)
--    검사·동작·security invoker·권한은 schema.sql과 같다. body만 추가
-- ---------------------------------------------------------------------------

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

revoke all on function public.submit_review(bigint, bigint[], text, text) from public;
grant execute on function public.submit_review(bigint, bigint[], text, text) to authenticated;

commit;

-- PostgREST가 새 칸·새 함수 모양을 바로 알도록
notify pgrst, 'reload schema';
