-- 메추리 데모 시드 2차 — 테스트 계정 10개(test6~15) + 국캠 가게 8곳 추가
-- 1차(seed_demo.sql: test1~5, 가게 12곳)를 실행한 뒤에 실행. Supabase → SQL Editor → 붙여넣기 → Run
--
-- ▸ 계정 비밀번호는 무작위(로그인용 아님, 저장소가 공개라 파일에 적지 않음)
-- ▸ 다시 실행해도 안전: test6에게 리스트가 이미 있으면 건너뜀
-- ▸ 데모 조건은 1차와 같다 (시뮬레이션으로 확인)
--   ① 한식 + 얼큰한 + 혼밥 → 비빔콩나물해장국만
--   ② 삼미당 '진한', 잇츠네이처 '달달한' — 새 리뷰에 맛 칩을 넣지 않아 여전히 1건 → 데모 리뷰 1건으로 태그 부여
--
-- 추가 가게
--   test-13 달인사골순대 송도AT점 (한식)
--   test-14 탕화쿵푸마라탕 트리플스트리트점 (중식)
--   test-15 상카츠 (일식)
--   test-16 포플러스한우쌀국수 본점 (아시안)
--   test-17 김밥천국 AT센터점 (분식)
--   test-18 마초스테이크 송도직영점 (양식)
--   test-19 커피기업 송도AIT센터점 (카페·디저트)
--   test-20 88노가리 송도점 (술집)

do $$
declare
  v_emails text[] := array['test6@users.mechuri.app', 'test7@users.mechuri.app', 'test8@users.mechuri.app', 'test9@users.mechuri.app', 'test10@users.mechuri.app', 'test11@users.mechuri.app', 'test12@users.mechuri.app', 'test13@users.mechuri.app', 'test14@users.mechuri.app', 'test15@users.mechuri.app'];
  v_email text;
  v_uid uuid;
  u uuid[];
  rec record;
  v_list bigint;
  v_review bigint;
  v_n int;
  v_i int := 22;
begin
  if not exists (select 1 from auth.users au join public.ranking_lists l on l.user_id = au.id
                 where au.email = 'test1@users.mechuri.app') then
    raise exception '1차 시드(seed_demo.sql)를 먼저 실행하세요';
  end if;

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

  -- u[6] = test6 … u[15] = test15 (배열 번호 = 계정 번호)
  select array_fill(null::uuid, array[5]) || array_agg(au.id order by e.ord) into u
  from unnest(v_emails) with ordinality as e(email, ord)
  join auth.users au on au.email = e.email;

  if exists (select 1 from public.ranking_lists where user_id = u[6]) then
    raise notice '이미 시드되어 있음 (test6 리스트 존재) — 건너뜀';
    return;
  end if;

  create temp table seed_alias (alias text primary key, kakao_id text not null) on commit drop;
  insert into seed_alias (alias, kakao_id) values
    ('test-1', '1502943013'), ('test-2', '1900160723'), ('test-3', '140348286'), ('test-4', '382105515'), ('test-5', '1852532431'), ('test-6', '598061543'), ('test-7', '329981510'), ('test-8', '1476310545'), ('test-9', '826620072'), ('test-10', '23521571'), ('test-11', '1193739361'), ('test-12', '98857444'), ('test-13', '123373057'), ('test-14', '1863737354'), ('test-15', '1201657501'), ('test-16', '135475248'), ('test-17', '1234418785'), ('test-18', '1295006802'), ('test-19', '1761273420'), ('test-20', '570924615');

  insert into public.places (kakao_place_id, name, address, category, kakao_category, lat, lng, created_by, created_at)
  select v.kid, v.name, v.address, v.category, v.kakao_category, v.lat, v.lng, u[6], now() - interval '3 days'
  from (values
    ('123373057', '달인사골순대 송도AT점', '인천 연수구 송도과학로 70', '한식', '음식점 > 한식 > 순대', 37.3804459, 126.6655085),
    ('1863737354', '탕화쿵푸마라탕 트리플스트리트점', '인천 연수구 연구단지로55번길 16', '중식', '음식점 > 중식 > 중국요리 > 탕화쿵푸마라탕', 37.3777524, 126.6641193),
    ('1201657501', '상카츠', '인천 연수구 송도과학로16번길 33-4', '일식', '음식점 > 일식 > 돈까스,우동', 37.3786561, 126.6628371),
    ('135475248', '포플러스한우쌀국수 본점', '인천 연수구 송도과학로16번길 33-3', '아시안', '음식점 > 아시아음식', 37.3797437, 126.6609919),
    ('1234418785', '김밥천국 AT센터점', '인천 연수구 송도과학로 70', '분식', '음식점 > 분식', 37.3804459, 126.6655085),
    ('1295006802', '마초스테이크 송도직영점', '인천 연수구 송도과학로16번길 33-3', '양식', '음식점 > 양식 > 스테이크,립', 37.3797923, 126.6609544),
    ('1761273420', '커피기업 송도AIT센터점', '인천 연수구 송도과학로 80', '카페·디저트', '음식점 > 카페 > 커피전문점', 37.3799268, 126.6661114),
    ('570924615', '88노가리 송도점', '인천 연수구 송도과학로16번길 33-3', '술집', '음식점 > 술집 > 호프,요리주점', 37.3797923, 126.6609544)
  ) as v(kid, name, address, category, kakao_category, lat, lng)
  on conflict (kakao_place_id) do nothing;

  for rec in select * from (values
    (6, array['test-1', 'test-13', 'test-7', 'test-17']),
    (7, array['test-6', 'test-15', 'test-9', 'test-16', 'test-19']),
    (8, array['test-3', 'test-20', 'test-5', 'test-11']),
    (9, array['test-12', 'test-19', 'test-8', 'test-18']),
    (10, array['test-14', 'test-4', 'test-10', 'test-17', 'test-1']),
    (11, array['test-1', 'test-6', 'test-16', 'test-3', 'test-12', 'test-20']),
    (12, array['test-15', 'test-7', 'test-2']),
    (13, array['test-9', 'test-16', 'test-14', 'test-4']),
    (14, array['test-11', 'test-5', 'test-20', 'test-3', 'test-2']),
    (15, array['test-18', 'test-8', 'test-12', 'test-6'])
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

  for rec in select * from (values
    (6, 'test-1', array['cuisine:국밥·해장국', 'taste:얼큰한', 'situation:혼밥', 'situation:해장', 'value:좋음']),
    (6, 'test-13', array['cuisine:국밥·해장국', 'taste:진한', 'taste:고소한', 'situation:혼밥', 'portion:푸짐']),
    (6, 'test-7', array['cuisine:라멘·우동', 'situation:혼밥', 'mood:아늑한', 'wait:조금 대기']),
    (6, 'test-17', array['cuisine:김밥', 'situation:빠른 한 끼', 'price:1인 1만 원 이하', 'value:좋음']),
    (7, 'test-6', array['cuisine:돈까스', 'taste:고소한', 'situation:혼밥', 'portion:푸짐', 'kind:친절함']),
    (7, 'test-15', array['cuisine:돈까스', 'taste:고소한', 'taste:담백한', 'situation:밥약', 'mood:세련된', 'wait:오래 대기']),
    (7, 'test-9', array['cuisine:쌀국수', 'taste:깔끔한', 'situation:해장', 'situation:혼밥', 'clean:깨끗함']),
    (7, 'test-19', array['cuisine:커피', 'mood:조용한', 'situation:밥약', 'price:1인 1만 원 이하']),
    (8, 'test-3', array['cuisine:고기·구이', 'taste:고소한', 'situation:술자리', 'situation:단체·회식', 'portion:푸짐']),
    (8, 'test-20', array['cuisine:호프', 'situation:술자리', 'mood:시끌벅적한', 'price:1인 1만 원 이하', 'value:좋음']),
    (8, 'test-5', array['cuisine:포차', 'taste:자극적인', 'situation:술자리', 'mood:시끌벅적한', 'mood:노포']),
    (8, 'test-11', array['cuisine:치킨', 'taste:짭짤한', 'taste:고소한', 'situation:술자리', 'portion:푸짐']),
    (9, 'test-12', array['cuisine:베이커리·디저트', 'mood:감성적인', 'situation:데이트', 'clean:깨끗함']),
    (9, 'test-19', array['cuisine:커피', 'mood:조용한', 'situation:혼밥', 'wait:바로 입장']),
    (9, 'test-8', array['cuisine:파스타', 'taste:느끼한', 'taste:고소한', 'situation:데이트', 'mood:세련된', 'price:1~2만 원']),
    (9, 'test-18', array['cuisine:스테이크', 'situation:손님 대접', 'situation:데이트', 'price:2만 원 이상', 'mood:세련된']),
    (10, 'test-14', array['cuisine:마라', 'taste:매운', 'taste:자극적인', 'situation:혼밥', 'price:1~2만 원']),
    (10, 'test-4', array['cuisine:짜장·짬뽕', 'taste:짭짤한', 'situation:빠른 한 끼', 'situation:단체·회식', 'value:좋음']),
    (10, 'test-10', array['cuisine:떡볶이', 'taste:매운', 'taste:달달한', 'situation:빠른 한 끼']),
    (10, 'test-17', array['cuisine:김밥', 'situation:혼밥', 'situation:빠른 한 끼', 'clean:보통']),
    (10, 'test-1', array['taste:얼큰한', 'taste:진한', 'situation:해장', 'situation:혼밥', 'mood:노포']),
    (11, 'test-1', array['cuisine:국밥·해장국', 'taste:얼큰한', 'situation:혼밥', 'kind:친절함']),
    (11, 'test-6', array['cuisine:돈까스', 'situation:밥약', 'clean:깨끗함']),
    (11, 'test-16', array['cuisine:쌀국수', 'taste:깔끔한', 'taste:담백한', 'situation:해장', 'portion:푸짐']),
    (11, 'test-20', array['cuisine:호프', 'situation:술자리', 'situation:단체·회식', 'wait:바로 입장']),
    (12, 'test-15', array['cuisine:돈까스', 'taste:고소한', 'situation:혼밥', 'value:비쌈']),
    (12, 'test-7', array['cuisine:라멘·우동', 'situation:빠른 한 끼', 'wait:오래 대기', 'clean:깨끗함']),
    (12, 'test-2', array['cuisine:찌개·백반', 'taste:얼큰한', 'taste:매운', 'situation:단체·회식', 'situation:밥약', 'value:좋음']),
    (13, 'test-9', array['cuisine:쌀국수', 'taste:깔끔한', 'situation:해장', 'mood:아늑한']),
    (13, 'test-16', array['cuisine:쌀국수', 'taste:담백한', 'situation:혼밥', 'price:1인 1만 원 이하']),
    (13, 'test-14', array['cuisine:마라', 'taste:매운', 'taste:얼큰한', 'situation:혼밥']),
    (13, 'test-4', array['cuisine:짜장·짬뽕', 'situation:단체·회식', 'mood:노포', 'portion:푸짐']),
    (14, 'test-11', array['cuisine:치킨', 'taste:짭짤한', 'situation:술자리', 'kind:친절함']),
    (14, 'test-5', array['cuisine:포차', 'situation:술자리', 'mood:노포', 'price:1~2만 원']),
    (14, 'test-2', array['cuisine:찌개·백반', 'taste:얼큰한', 'situation:단체·회식', 'clean:보통']),
    (14, 'test-3', array['cuisine:고기·구이', 'situation:술자리', 'situation:단체·회식', 'value:비쌈']),
    (15, 'test-18', array['cuisine:스테이크', 'taste:고소한', 'situation:손님 대접', 'price:2만 원 이상', 'clean:깨끗함']),
    (15, 'test-8', array['cuisine:파스타', 'taste:느끼한', 'situation:데이트', 'mood:아늑한']),
    (15, 'test-12', array['cuisine:커피', 'mood:조용한', 'situation:혼밥', 'wait:바로 입장']),
    (15, 'test-6', array['cuisine:돈까스', 'taste:담백한', 'situation:혼밥', 'value:좋음'])
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
      raise exception 'test% / % 리뷰: 칩 % 개 중 % 개만 찾음', rec.uno, rec.kid, cardinality(rec.tg), v_n;
    end if;
  end loop;

  raise notice '2차 시드 완료: 계정 10, 가게 8, 리스트 10, 리뷰 40';
end
$$;

-- 결과 요약 (전체 기준. 이 표가 20 / 15 / 66 / 62 / 287 이면 성공)
select
  (select count(*) from public.places) as places,
  (select count(*) from public.ranking_lists l join auth.users au on au.id = l.user_id where au.email like 'test%@users.mechuri.app') as lists,
  (select count(*) from public.ranking_items i join auth.users au on au.id = i.user_id where au.email like 'test%@users.mechuri.app') as list_items,
  (select count(*) from public.reviews r join auth.users au on au.id = r.user_id where au.email like 'test%@users.mechuri.app') as reviews,
  (select count(*) from public.review_tags rt join auth.users au on au.id = rt.user_id where au.email like 'test%@users.mechuri.app') as review_tags;
