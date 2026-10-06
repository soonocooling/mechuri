-- 메추리 seed_test.sql — 테스트·데모 시드 (plan.md, WORK_SPLIT §7-6)  담당 C
-- 실행: Supabase → SQL Editor → 전체 붙여넣기 → Run (schema.sql 실행 + B가 test1~5 계정 만든 뒤)
--
-- ▸ 사용자 uuid를 복사해 붙일 필요 없음: auth.users에서 아래 이메일 5개를 직접 찾는다.
--   계정 이메일이 다르면 바로 아래 v_emails 배열만 고친다.
-- ▸ SQL Editor는 auth.uid()가 null이라 save_list/submit_review RPC를 못 쓴다 → 여기서만 직접 insert.
--   (앱 코드에서는 직접 insert 금지 규칙 그대로)
-- ▸ 전체가 DO 블록 하나 = 트랜잭션 하나. 중간에 실패하면 아무것도 안 들어간다.
-- ▸ 다시 실행해도 안전: places에 'test-1'이 이미 있으면 아무것도 안 하고 끝난다.
-- ▸ 시각은 과거로 박아 둔다(리스트 2일 전, 리뷰 1일 전) → 데모 중 새 입력이 항상 "가장 최근"이 된다.
--
-- 데모 조건
--  ① 한식 + 얼큰한(맛) + 혼밥(상황) → 국캠국밥만 남음 (얼큰한 3/3, 혼밥 3/3 = LB 0.438)
--     얼큰찌개마을은 얼큰한만, 캠퍼스고깃집은 혼밥 1/2(0.095)라 탈락
--  ② 가게 X 두 곳 — 맛 칩을 고른 현재 리뷰가 1건뿐(LB 0.207, 미부여)
--     X1 = 라멘하우스(test-7) : '진한' 1건
--     X2 = 커피메추리(test-12) : '달달한' 1건
--     → 데모 계정이 상세에서 그 칩 넣은 리뷰 1건 제출 → 2/2 = 0.342 → 태그 붙음
--     리뷰는 삭제가 없어서 한 번 쓰면 끝. 리허설은 X1, 본 데모는 X2로.
--     (다른 가게에 하면 윌슨 하한 때문에 안 바뀔 수 있음)

do $$
declare
  v_emails text[] := array['test1@users.mechuri.app', 'test2@users.mechuri.app', 'test3@users.mechuri.app', 'test4@users.mechuri.app', 'test5@users.mechuri.app'];
  u uuid[];
  rec record;
  v_list bigint;
  v_review bigint;
  v_n int;
  v_i int := 0;
begin
  if exists (select 1 from public.places where kakao_place_id = 'test-1') then
    raise notice '이미 시드되어 있음 (places에 test-1 존재) — 건너뜀';
    return;
  end if;

  select array_agg(au.id order by e.ord) into u
  from unnest(v_emails) with ordinality as e(email, ord)
  join auth.users au on au.email = e.email;
  if coalesce(array_length(u, 1), 0) <> array_length(v_emails, 1) then
    raise exception '테스트 계정 % 개 중 % 개만 찾음. Authentication → Users에서 이메일 확인 후 v_emails 수정',
      array_length(v_emails, 1), coalesce(array_length(u, 1), 0);
  end if;

  -- places 12곳 (created_by = test1)
  insert into public.places (kakao_place_id, name, address, category, kakao_category, lat, lng, created_by, created_at)
  select v.kid, v.name, v.address, v.category, v.kakao_category, v.lat, v.lng, u[1], now() - interval '3 days'
  from (values
    ('test-1', '국캠국밥', '인천 연수구 송도과학로 1 (테스트)', '한식', '음식점 > 한식 > 해장국', 37.3832, 126.6671),
    ('test-2', '얼큰찌개마을', '인천 연수구 송도과학로 2 (테스트)', '한식', '음식점 > 한식 > 찌개,전골', 37.3841, 126.6655),
    ('test-3', '캠퍼스고깃집', '인천 연수구 송도과학로 3 (테스트)', '한식', '음식점 > 한식 > 육류,고기', 37.3808, 126.6702),
    ('test-4', '송도반점', '인천 연수구 아카데미로 4 (테스트)', '중식', '음식점 > 중식 > 중국요리', 37.3795, 126.6668),
    ('test-5', '국캠포차', '인천 연수구 아카데미로 5 (테스트)', '술집', '음식점 > 술집 > 실내포장마차', 37.3853, 126.6712),
    ('test-6', '국캠돈까스', '인천 연수구 송도문화로 6 (테스트)', '일식', '음식점 > 일식 > 돈까스,우동', 37.3826, 126.6633),
    ('test-7', '라멘하우스', '인천 연수구 송도문화로 7 (테스트)', '일식', '음식점 > 일식 > 일본식라면', 37.3817, 126.6724),
    ('test-8', '파스타공방', '인천 연수구 송도문화로 8 (테스트)', '양식', '음식점 > 양식 > 이탈리안', 37.386, 126.668),
    ('test-9', '포보포', '인천 연수구 송도과학로 9 (테스트)', '아시안', '음식점 > 아시아음식 > 베트남음식', 37.3788, 126.6691),
    ('test-10', '국캠분식', '인천 연수구 아카데미로 10 (테스트)', '분식', '음식점 > 분식', 37.3835, 126.6698),
    ('test-11', '바삭치킨', '인천 연수구 아카데미로 11 (테스트)', '치킨', '음식점 > 치킨', 37.3803, 126.6646),
    ('test-12', '커피메추리', '인천 연수구 송도문화로 12 (테스트)', '카페·디저트', '음식점 > 카페 > 커피전문점', 37.3846, 126.6639)
  ) as v(kid, name, address, category, kakao_category, lat, lng);

  -- 사용자마다 현재 리스트 1개 (배열 순서 = 1위, 2위, …)
  for rec in select * from (values
    (1, array['test-1', 'test-3', 'test-6', 'test-12']),
    (2, array['test-1', 'test-2', 'test-7', 'test-10', 'test-11']),
    (3, array['test-6', 'test-1', 'test-4', 'test-8']),
    (4, array['test-3', 'test-1', 'test-7', 'test-9', 'test-5', 'test-11']),
    (5, array['test-2', 'test-6', 'test-12'])
  ) as x(uno, kids) loop
    insert into public.ranking_lists (user_id, is_onboarding, created_at)
    values (u[rec.uno], true, now() - interval '2 days')
    returning id into v_list;

    insert into public.ranking_items (list_id, user_id, place_id, rank, created_at)
    select v_list, u[rec.uno], p.id, k.ord, now() - interval '2 days'
    from unnest(rec.kids) with ordinality as k(kid, ord)
    join public.places p on p.kakao_place_id = k.kid;
    get diagnostics v_n = row_count;
    if v_n <> cardinality(rec.kids) then
      raise exception 'test% 리스트: 가게 % 개 중 % 개만 들어감', rec.uno, cardinality(rec.kids), v_n;
    end if;
  end loop;

  -- 리뷰 + 고른 칩 ('group_key:label')
  for rec in select * from (values
    (1, 'test-1',  array['cuisine:국밥·해장국', 'taste:얼큰한', 'taste:진한', 'situation:혼밥', 'situation:해장', 'mood:노포', 'clean:보통', 'value:좋음']),
    (1, 'test-3',  array['cuisine:고기·구이', 'taste:고소한', 'situation:술자리', 'situation:단체·회식', 'mood:시끌벅적한']),
    (1, 'test-6',  array['cuisine:돈까스', 'taste:고소한', 'situation:혼밥', 'situation:빠른 한 끼', 'clean:깨끗함', 'portion:푸짐']),
    (1, 'test-12', array['cuisine:커피', 'mood:감성적인', 'mood:조용한', 'situation:데이트']),
    (2, 'test-1',  array['cuisine:국밥·해장국', 'taste:얼큰한', 'situation:혼밥', 'situation:빠른 한 끼', 'kind:친절함', 'value:좋음']),
    (2, 'test-2',  array['cuisine:찌개·백반', 'taste:얼큰한', 'situation:단체·회식', 'price:1인 1만 원 이하']),
    (2, 'test-7',  array['cuisine:라멘·우동', 'taste:진한', 'situation:혼밥', 'wait:조금 대기']),
    (2, 'test-11', array['cuisine:치킨', 'taste:짭짤한', 'situation:술자리', 'price:1~2만 원']),
    (2, 'test-10', array['cuisine:떡볶이', 'cuisine:김밥', 'taste:매운', 'taste:달달한', 'situation:빠른 한 끼', 'price:1인 1만 원 이하']),
    (3, 'test-1',  array['taste:얼큰한', 'taste:짭짤한', 'situation:혼밥', 'mood:노포', 'clean:깨끗함', 'portion:푸짐']),
    (3, 'test-6',  array['cuisine:돈까스', 'taste:고소한', 'taste:담백한', 'situation:밥약', 'clean:깨끗함', 'kind:친절함']),
    (3, 'test-4',  array['cuisine:짜장·짬뽕', 'taste:짭짤한', 'situation:빠른 한 끼', 'price:1인 1만 원 이하']),
    (3, 'test-8',  array['cuisine:파스타', 'taste:느끼한', 'mood:세련된', 'situation:데이트']),
    (4, 'test-3',  array['cuisine:고기·구이', 'taste:고소한', 'situation:술자리', 'situation:혼밥', 'value:비쌈']),
    (4, 'test-7',  array['cuisine:라멘·우동', 'situation:혼밥', 'situation:빠른 한 끼', 'wait:오래 대기']),
    (4, 'test-11', array['cuisine:치킨', 'taste:짭짤한', 'taste:자극적인', 'situation:술자리', 'mood:시끌벅적한']),
    (4, 'test-9',  array['cuisine:쌀국수', 'taste:깔끔한', 'situation:해장', 'situation:혼밥']),
    (4, 'test-5',  array['cuisine:포차', 'situation:술자리', 'mood:시끌벅적한']),
    (5, 'test-2',  array['cuisine:찌개·백반', 'taste:얼큰한', 'taste:매운', 'situation:단체·회식', 'situation:밥약', 'clean:보통']),
    (5, 'test-6',  array['cuisine:돈까스', 'situation:혼밥', 'mood:아늑한', 'clean:깨끗함', 'portion:푸짐']),
    (5, 'test-12', array['cuisine:베이커리·디저트', 'taste:달달한', 'mood:감성적인', 'situation:데이트', 'situation:밥약', 'clean:깨끗함']),
    (5, 'test-10', array['cuisine:떡볶이', 'taste:매운', 'situation:빠른 한 끼'])
  ) as x(uno, kid, tg) loop
    v_i := v_i + 1;
    insert into public.reviews (user_id, place_id, source, created_at)
    select u[rec.uno], p.id, 'onboarding', now() - interval '1 day' + v_i * interval '1 minute'
    from public.places p where p.kakao_place_id = rec.kid
    returning id into v_review;

    insert into public.review_tags (review_id, user_id, tag_id, created_at)
    select v_review, u[rec.uno], t.id, now() - interval '1 day' + v_i * interval '1 minute'
    from unnest(rec.tg) as s(chip)
    join public.tags t on t.group_key = split_part(s.chip, ':', 1) and t.label = split_part(s.chip, ':', 2);
    get diagnostics v_n = row_count;
    if v_n <> cardinality(rec.tg) then
      raise exception 'test% / % 리뷰: 칩 % 개 중 % 개만 찾음 (tags 시드 확인)', rec.uno, rec.kid, cardinality(rec.tg), v_n;
    end if;
  end loop;

  raise notice '시드 완료: places %, 리스트 %, 리뷰 %', 12, 5, 22;
end
$$;

-- 결과 요약 (Run 후 아래 표가 보이면 성공: 12 / 5 / 22 / 22 / 108)
select
  (select count(*) from public.places where kakao_place_id like 'test-%') as places,
  (select count(*) from public.ranking_lists l join auth.users au on au.id = l.user_id where au.email like 'test_@users.mechuri.app') as lists,
  (select count(*) from public.ranking_items i join auth.users au on au.id = i.user_id where au.email like 'test_@users.mechuri.app') as list_items,
  (select count(*) from public.reviews r join auth.users au on au.id = r.user_id where au.email like 'test_@users.mechuri.app') as reviews,
  (select count(*) from public.review_tags rt join auth.users au on au.id = rt.user_id where au.email like 'test_@users.mechuri.app') as review_tags;

-- ---------------------------------------------------------------------------
-- 검증용 (필요할 때 주석 풀고 하나씩 실행)
-- ---------------------------------------------------------------------------
-- 1) 가게별 꼽은 사람 수 n, 1위 표 수 — 기대값: 국캠국밥 4/2, 국캠돈까스 3/1, 얼큰찌개마을·캠퍼스고깃집 2/1,
--    라멘하우스·커피메추리·바삭치킨 2/0, 나머지 5곳 1명
-- select p.name, count(*) as n, count(*) filter (where i.rank = 1) as n_first
-- from public.ranking_items i join public.places p on p.id = i.place_id
-- where p.kakao_place_id like 'test-%'
-- group by p.name order by n desc, n_first desc, p.name;
--
-- 2) 앱 순위 탭 기대값 (S̃ = S·n/(n+2), w(r) = 1/log₂(r+1))
--    모든 가게(n ≥ 1)가 한 순위. S̃가 같으면 공동 순위(같은 숫자), 표시 순서는 동점 규칙(n → 1위 표 → 이름)
--    1 국캠국밥 2.1746 / 2 국캠돈까스 1.2786 / 3 얼큰찌개마을 0.8155 / 3 캠퍼스고깃집 0.8155(공동)
--    5 라멘하우스 0.5000 / 6 커피메추리 0.4653 / 7 바삭치킨 0.3715 / 8 송도반점 0.1667
--    9 국캠분식·파스타공방·포보포 0.1436(공동) / 12 국캠포차 0.1290
--    지도 색(N = 12): 1단계 1~2위 / 2단계 3위 / 3단계 5~8위 / 4단계 9·12위
--
-- 3) 가게 X 맛 칩 — 기대값: 라멘하우스 진한 1, 커피메추리 달달한 1 (가게마다 1줄)
-- select p.name, t.label, count(*) from public.review_tags rt
-- join public.reviews r on r.id = rt.review_id
-- join public.places p on p.id = r.place_id
-- join public.tags t on t.id = rt.tag_id
-- where p.kakao_place_id in ('test-7', 'test-12') and t.group_key = 'taste'
-- group by p.name, t.label;
--
-- 4) 국캠국밥 맛·상황 칩 — 기대값: 얼큰한 3, 진한 1, 짭짤한 1 / 혼밥 3, 해장 1, 빠른 한 끼 1
-- select t.group_key, t.label, count(*) from public.review_tags rt
-- join public.reviews r on r.id = rt.review_id
-- join public.places p on p.id = r.place_id
-- join public.tags t on t.id = rt.tag_id
-- where p.kakao_place_id = 'test-1' and t.group_key in ('taste', 'situation')
-- group by t.group_key, t.label order by 1, 3 desc;
