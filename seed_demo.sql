-- 메추리 데모 시드 — 실제 국캠 가게 버전 (seed_test.sql 기반, 데이터 구조·데모 조건은 그대로)
-- 실행: Supabase → SQL Editor → 전체 붙여넣기 → Run. 이 한 번으로 끝 (테스트 계정 생성 포함)
--
-- ▸ 테스트 계정 test1~5@users.mechuri.app 이 없으면 만든다. 비밀번호는 실행할 때마다 무작위
--   (데이터 주인 역할만 하고 로그인용이 아님. 저장소가 공개라 비밀번호를 파일에 적지 않는다)
-- ▸ 다시 실행해도 안전: test1에게 리스트가 이미 있으면 아무것도 안 하고 끝난다
-- ▸ 시각은 과거로 박아 둔다(리스트 2일 전, 리뷰 1일 전) → 데모 중 새 입력이 항상 "가장 최근"이 된다
--
-- 가게 별칭 → 실제 가게
--   test-1  비빔콩나물해장국 (한식)
--   test-2  빅쭌부대찌개 송도점 (한식)
--   test-3  하남돼지집 송도트리플스트리트점 (한식)
--   test-4  송도반점 (중식)
--   test-5  우이락 송도트리플스트리트점 (술집)
--   test-6  이백장돈가스 송도테크노파크점 (일식)
--   test-7  삼미당 트리플스트리트점 (일식)
--   test-8  조우마 (양식)
--   test-9  월미당 송도점 (아시안)
--   test-10 제임스떡뽀끼 송도3연세대점 (분식)
--   test-11 깐부치킨 송도AT센터점 (치킨)
--   test-12 잇츠네이처 연세대국제캠퍼스점 (카페·디저트)
--
-- 데모 조건
--  ① 한식 + 얼큰한(맛) + 혼밥(상황) → 비빔콩나물해장국만 남음 (얼큰한 3/3, 혼밥 3/3 = LB 0.438)
--     빅쭌부대찌개 송도점은 얼큰한만, 하남돼지집 송도트리플스트리트점은 혼밥 1/2(0.095)라 탈락
--  ② 가게 X 두 곳 — 맛 칩을 고른 현재 리뷰가 1건뿐(LB 0.207, 미부여)
--     X1 = 삼미당 트리플스트리트점 : '진한' 1건
--     X2 = 잇츠네이처 연세대국제캠퍼스점 : '달달한' 1건
--     → 데모 계정이 상세에서 그 칩 넣은 리뷰 1건 제출 → 2/2 = 0.342 → 태그 붙음
--     리뷰는 삭제가 없어서 한 번 쓰면 끝. 리허설은 X1, 본 데모는 X2로.

do $$
declare
  v_emails text[] := array['test1@users.mechuri.app', 'test2@users.mechuri.app', 'test3@users.mechuri.app', 'test4@users.mechuri.app', 'test5@users.mechuri.app'];
  v_email text;
  v_uid uuid;
  u uuid[];
  rec record;
  v_list bigint;
  v_review bigint;
  v_n int;
  v_i int := 0;
begin
  -- 1) 테스트 계정 (없을 때만)
  foreach v_email in array v_emails loop
    if not exists (select 1 from auth.users where email = v_email) then
      v_uid := gen_random_uuid();
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, email_change, email_change_token_new, recovery_token)
      values ('00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', v_email,
        extensions.crypt(encode(extensions.gen_random_bytes(18), 'base64'), extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
      insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), v_uid, v_uid::text,
        jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true),
        'email', now(), now(), now());
    end if;
  end loop;

  select array_agg(au.id order by e.ord) into u
  from unnest(v_emails) with ordinality as e(email, ord)
  join auth.users au on au.email = e.email;

  if exists (select 1 from public.ranking_lists where user_id = u[1]) then
    raise notice '이미 시드되어 있음 (test1 리스트 존재) — 건너뜀';
    return;
  end if;

  -- 2) 가게 12곳 (이미 누가 추가한 가게면 그 행을 그대로 쓴다)
  create temp table seed_alias (alias text primary key, kakao_id text not null) on commit drop;
  insert into seed_alias (alias, kakao_id) values
    ('test-1', '1502943013'), ('test-2', '1900160723'), ('test-3', '140348286'), ('test-4', '382105515'), ('test-5', '1852532431'), ('test-6', '598061543'), ('test-7', '329981510'), ('test-8', '1476310545'), ('test-9', '826620072'), ('test-10', '23521571'), ('test-11', '1193739361'), ('test-12', '98857444');

  insert into public.places (kakao_place_id, name, address, category, kakao_category, lat, lng, created_by, created_at)
  select v.kid, v.name, v.address, v.category, v.kakao_category, v.lat, v.lng, u[1], now() - interval '3 days'
  from (values
    ('test-1', '1502943013', '비빔콩나물해장국', '인천 연수구 송도과학로 70', '한식', '음식점 > 한식 > 국밥', 37.3804459, 126.6655085),
    ('test-2', '1900160723', '빅쭌부대찌개 송도점', '인천 연수구 송도과학로 32', '한식', '음식점 > 한식 > 찌개,전골', 37.3818597, 126.6626941),
    ('test-3', '140348286', '하남돼지집 송도트리플스트리트점', '인천 연수구 송도과학로16번길 33-3', '한식', '음식점 > 한식 > 육류,고기 > 삼겹살 > 하남돼지집', 37.3801513, 126.6610894),
    ('test-4', '382105515', '송도반점', '인천 연수구 송도과학로 70', '중식', '음식점 > 중식 > 중국요리', 37.3804459, 126.6655085),
    ('test-5', '1852532431', '우이락 송도트리플스트리트점', '인천 연수구 송도과학로16번길 33-3', '술집', '음식점 > 술집 > 실내포장마차 > 우이락', 37.3797923, 126.6609544),
    ('test-6', '598061543', '이백장돈가스 송도테크노파크점', '인천 연수구 송도과학로 80', '일식', '음식점 > 일식 > 돈까스,우동 > 이백장돈가스', 37.3796534, 126.6659580),
    ('test-7', '329981510', '삼미당 트리플스트리트점', '인천 연수구 송도과학로16번길 13-18', '일식', '음식점 > 일식 > 일본식라면', 37.3810209, 126.6608134),
    ('test-8', '1476310545', '조우마', '인천 연수구 송도과학로28번길 8', '양식', '음식점 > 양식 > 이탈리안', 37.3828939, 126.6607293),
    ('test-9', '826620072', '월미당 송도점', '인천 연수구 송도과학로 80', '아시안', '음식점 > 아시아음식 > 동남아음식 > 베트남음식', 37.3791002, 126.6653586),
    ('test-10', '23521571', '제임스떡뽀끼 송도3연세대점', '인천 연수구 송도과학로51번길 136', '분식', '음식점 > 분식 > 떡볶이', 37.3839597, 126.6738339),
    ('test-11', '1193739361', '깐부치킨 송도AT센터점', '인천 연수구 송도과학로 70', '치킨', '음식점 > 치킨 > 깐부치킨', 37.3804459, 126.6655085),
    ('test-12', '98857444', '잇츠네이처 연세대국제캠퍼스점', '인천 연수구 송도과학로 85', '카페·디저트', '음식점 > 카페', 37.3823204, 126.6698100)
  ) as v(alias, kid, name, address, category, kakao_category, lat, lng)
  on conflict (kakao_place_id) do nothing;

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
    join seed_alias sa on sa.alias = k.kid
    join public.places p on p.kakao_place_id = sa.kakao_id;
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
    from seed_alias sa join public.places p on p.kakao_place_id = sa.kakao_id where sa.alias = rec.kid
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

  raise notice '시드 완료: 계정 5, 가게 12, 리스트 5, 리뷰 22';
end
$$;

-- 결과 요약 (Run 후 이 표가 12 / 5 / 22 / 22 / 108 이면 성공)
select
  (select count(*) from public.places where kakao_place_id in ('1502943013', '1900160723', '140348286', '382105515', '1852532431', '598061543', '329981510', '1476310545', '826620072', '23521571', '1193739361', '98857444')) as places,
  (select count(*) from public.ranking_lists l join auth.users au on au.id = l.user_id where au.email like 'test_@users.mechuri.app') as lists,
  (select count(*) from public.ranking_items i join auth.users au on au.id = i.user_id where au.email like 'test_@users.mechuri.app') as list_items,
  (select count(*) from public.reviews r join auth.users au on au.id = r.user_id where au.email like 'test_@users.mechuri.app') as reviews,
  (select count(*) from public.review_tags rt join auth.users au on au.id = rt.user_id where au.email like 'test_@users.mechuri.app') as review_tags;
