# 메추리 — plan.md

팀과 AI가 같이 보는 설계도. 테이블·열·파일 담당이 바뀌면 **이 파일부터 고친다.**
상세 기획서: `docs/product-spec.md` (이 파일과 충돌하면 이 파일이 우선)

## 0. 서비스 요약
- 연세대 국제캠퍼스 주변 맛집 지도 + 메뉴 추천 웹앱
- 가입자가 "내 맛집 Top 3~10"을 순위로 입력 → 전체 합산 순위
- 가게마다 태그(음식 종류·맛·분위기·상황·가격대·청결·친절 등)를 칩으로 입력 → 태그 필터
- 정보를 많이 입력할수록 포인트 보상 → 포인트로 추가 추천
- 개인화 추천: 무료 주 1회 1곳 / 프리미엄(모의 결제) 무제한 5곳
- 스택: Next.js(App Router, TypeScript) + Tailwind + Supabase + Vercel + 카카오 로컬 API
- 구현 원칙: 모든 페이지·컴포넌트는 `'use client'`. Supabase 호출은 `lib/supabase.ts` 브라우저 클라이언트(로그인 세션)로만 한다. 서버 코드는 `app/api/places/search` 하나이고 DB를 건드리지 않는다 (서버에는 사용자 세션이 없어 RLS의 auth.uid()가 null → 빈 결과·insert 거부)

## 1. 화면 (3장)

### 화면 1 — 시작: 로그인·가입 → 내 맛집 입력(온보딩)
```
┌───────────────────────┐
│ 메추리                 │
│ 아이디  [ soono     ] │ [저장] 아이디 (Supabase Auth)
│ 비밀번호 [ ******** ] │ [저장] 비밀번호 (Supabase Auth, 우리 테이블엔 없음)
│ [가입] [로그인]        │
└───────────────────────┘
        ↓ 가입 직후
┌───────────────────────┐
│ 내 맛집 Top 3          │
│ 🔍 가게 검색(카카오)   │ [저장] 처음 고른 가게 → places
│ 1. ○○국밥   ≡         │ [저장] 리스트 1건 → ranking_lists
│ 2. △△돈까스 ≡         │ [저장] 가게·순위 → ranking_items
│ 3. □□마라탕 ≡         │
│ [다음]                 │
├───────────────────────┤
│ ○○국밥 어땠어? (1/3)   │
│ 입력한 정보 7개 · +2P   │
│ 음식종류 [국밥][해장국] │ [저장] 리뷰 1건 → reviews
│ 맛 [얼큰한][진한]      │ [저장] 고른 칩 → review_tags
│ 분위기 [노포]          │
│ 상황 [혼밥][해장]      │
│ 청결 ○좋음 ●보통 ○아쉬움│
│ [건너뛰기]   [다음 →]  │
├───────────────────────┤
│ 완료! +9P 획득         │
│ [첫 추천 받기] [더 추가]│
└───────────────────────┘
```

### 화면 2 — 순위 탭 (+ 가게 상세 시트)
```
┌───────────────────────┐
│ [전체][한식][중식][일식]…│ ← 대분류 칩
│ [필터 ⚙ 2]  [목록|지도] │ ← 태그 필터 시트
│ 1 ○○국밥  한식 · 12명  │
│   #얼큰한 #혼밥 #노포   │
│ 2 △△돈까스 일식 · 9명  │
│ …                      │
│ 신규 발견(1명만 꼽음)   │
└───────────────────────┘
   탭 → 상세 시트
┌───────────────────────┐
│ ○○국밥  전체 1위       │
│ 12명이 꼽음 · 1위 5명   │
│ #얼큰한 #진한 #혼밥     │
│ 청결 ████░ 친절 ███░░  │
│ [간단 리뷰 남기기]      │ [저장] reviews, review_tags
│ [내 맛집에 추가]        │ [저장] ranking_lists, ranking_items
│ [카카오맵에서 보기]     │
└───────────────────────┘
```

### 화면 3 — 추천 탭 + 마이
```
┌───────────────────────┐
│ 오늘의 점심 메뉴 추천     │ [저장] 추천 실행 1건 → recommendations
│ △△돈까스               │
│ "○○국밥을 꼽은 사람들이 │
│  많이 꼽은 곳"          │
│ 다음 무료 추천까지 4일  │
│ [3P로 한 번 더] 잔액 9P │ [저장] recommendations(kind=point)
│ [프리미엄: 무제한 5곳]  │
└───────────────────────┘
   마이 → 프리미엄
┌───────────────────────┐
│ 프리미엄 월 1,900원     │
│ [결제하기]              │ [저장] 모의 결제 1건 → subscriptions
│ → 결제가 완료되었습니다 │
│   프리미엄 활성화 (30일)│
│ 베타 기간 실제 결제 없음│
└───────────────────────┘
```
- 추천 결과 위에 지도: 추천 가게 점은 꼽은 사람 수(n_p)가 많을수록 진한 한 가지 색(1명 / 2~3명 / 4명 이상 3단계), 내 리스트 가게는 회색 점, 국캠 위치 표시
- 알 깨기 연출(`components/EggHatch.tsx`, 추천 버튼을 눌렀을 때만, 동작 줄이기 설정이면 생략하고 버튼에 "메추리가 {끼니} 알을 낳고 있어요…"): 이번 주 무료 추천 전엔 맨 위 영역만 시작 화면(메추리 + 문구 + 추천 받기)이고 3P·프리미엄 영역은 그대로 보임 → 흰 연출 층에서 메추리가 들썩임(0.7초×2, recommend() 동시 호출, 늦으면 반복) → 알이 떨어져 튐(1초) → 금 3번 + 떨림(2초) → 윗껍데기가 오른쪽으로 경첩처럼 열린 뒤 아랫껍데기와 함께 아래로 떨어지고, 메추리·문구는 위로 빠지며, 페이지가 금 위치의 알 폭 틈에서 둥글게 열린 뒤 화면 전체로 clip-path로 벌어짐(1.6초), 0곳이면 흔들리기만 하고 "이번 알은 비어 있었어요…" 후 닫힘, 에러면 바로 닫힘. 3P·프리미엄은 짧은 버전(금 1번, 약 3초)
- 시간대 문구(한국 시간 Intl `Asia/Seoul`): 6~11시 아침, 11~17시 점심, 17~22시 저녁, 22~6시 야식 → 시작 "메추리가 낳은 알에 오늘의 {끼니} 메뉴가 들어 있어요", 들썩임·낙하 "메추리가 {끼니} 알을 낳고 있어요…", 금 "톡, 톡… 알에 금이 가고 있어요", 추천 탭 무료 추천 제목 "오늘의 {끼니} 메뉴 추천"·버튼 "오늘의 {끼니} 메뉴 추천 받기"

## 2. 테이블 (무엇 하나당 한 줄)

| 테이블 | 한 줄 = | 누가 채우나 |
|---|---|---|
| places | 가게 하나 | 사용자가 검색해서 처음 고를 때 |
| ranking_lists | 내 맛집 리스트 저장 한 번 | 사용자 |
| ranking_items | 저장된 리스트 속 가게 하나 | 사용자 |
| tags | 선택 가능한 칩 하나 | schema.sql 시드(사용자 추가 불가) |
| reviews | 가게 하나에 대한 태그 입력 제출 한 번 | 사용자 |
| review_tags | 제출에서 고른 칩 하나 | 사용자 |
| recommendations | 추천 실행 한 번 | 사용자 |
| subscriptions | 모의 결제 한 번 | 사용자 |

**수정·삭제 없이 추가만 한다.** (RLS: 읽기·추가만 허용)
- 리스트 수정 = 새 ranking_lists 한 줄 + 새 ranking_items. **사용자별 가장 최근 ranking_lists가 현재 리스트**
- 리뷰 수정 = 같은 가게에 새 reviews 한 줄. **(user, place)별 가장 최근 리뷰가 현재 리뷰**
- 포인트는 테이블이 없다. reviews·recommendations에서 계산한다(§5)
- 리스트·리뷰 저장은 DB 함수(§4-1) 한 번으로 한다. 부모·자식 행이 같이 들어가거나 같이 실패

## 3. 열

공통: 모든 테이블에 `id`(숫자, 자동 증가), `created_at`(시각, 기본값 now()).
사용자 연결은 `user_id`(Supabase Auth 사용자 uuid, 기본값 auth.uid()).

### places
| 열 | 종류 | 설명 |
|---|---|---|
| id | 숫자 | |
| kakao_place_id | 글자 | 카카오 장소 id. **중복 불가** |
| name | 글자 | |
| address | 글자 | 도로명 우선, 없으면 지번 |
| category | 글자 | 대분류 12종: 한식 / 중식 / 일식 / 양식 / 아시안 / 분식 / 치킨 / 버거·피자 / 샐러드·건강식 / 카페·디저트 / 술집 / 기타 (값은 이 문자열 그대로) |
| kakao_category | 글자 | 카카오 category_name 원문 ("음식점 > 한식 > 해장국") |
| lat | 숫자 | 위도 |
| lng | 숫자 | 경도 |
| created_by | 글자(uuid) | 처음 등록한 사용자, 기본값 auth.uid() |
| created_at | 시각 | |

### ranking_lists
| 열 | 종류 | 설명 |
|---|---|---|
| id | 숫자 | |
| user_id | 글자(uuid) | |
| is_onboarding | 참거짓 | 온보딩에서 저장한 첫 리스트면 true |
| created_at | 시각 | |

### ranking_items
| 열 | 종류 | 설명 |
|---|---|---|
| id | 숫자 | |
| list_id | 숫자 | → ranking_lists.id |
| user_id | 글자(uuid) | RLS 확인용 |
| place_id | 숫자 | → places.id |
| rank | 숫자 | 1~10 |
| created_at | 시각 | |

제약: rank 1~10 / 같은 list_id 안에서 place_id 중복 불가 / 같은 list_id 안에서 rank 중복 불가
리스트 한 개에 가게 3~10개는 앱에서 검사

### tags
| 열 | 종류 | 설명 |
|---|---|---|
| id | 숫자 | |
| group_key | 글자 | cuisine, taste, mood, situation, price, clean, kind, value, portion, wait |
| group_label | 글자 | 화면 표시 이름 |
| group_kind | 글자 | descriptive(서술형) / evaluative(평가형) |
| max_select | 숫자 | 그룹당 최대 선택 수 |
| label | 글자 | 칩 이름 |
| parent_label | 글자 | cuisine 그룹만: 해당 대분류(예: 한식). 나머지 null |
| value | 숫자 | 평가형만 +1/0/−1. 서술형 null |
| sort | 숫자 | 표시 순서 |
| created_at | 시각 | |

### reviews
| 열 | 종류 | 설명 |
|---|---|---|
| id | 숫자 | |
| user_id | 글자(uuid) | |
| place_id | 숫자 | → places.id |
| source | 글자 | onboarding / review / list_add |
| created_at | 시각 | |

### review_tags
| 열 | 종류 | 설명 |
|---|---|---|
| id | 숫자 | |
| review_id | 숫자 | → reviews.id |
| user_id | 글자(uuid) | RLS 확인용 |
| tag_id | 숫자 | → tags.id |
| created_at | 시각 | |

제약: 같은 review_id 안에서 tag_id 중복 불가

### recommendations
| 열 | 종류 | 설명 |
|---|---|---|
| id | 숫자 | |
| user_id | 글자(uuid) | |
| kind | 글자 | free / point / premium |
| result_json | 글자 | 추천 결과 JSON 문자열 `[{"place_id":3,"reason":"..."}]` |
| created_at | 시각 | |

### subscriptions
| 열 | 종류 | 설명 |
|---|---|---|
| id | 숫자 | |
| user_id | 글자(uuid) | |
| amount | 숫자 | 표시 가격(원). 실제 결제 없음 |
| period_end | 시각 | 기본값 now() + 30일 |
| created_at | 시각 | |

제약: period_end ≤ created_at + 31일

## 4. RLS (문지기)
모든 테이블 RLS 켬. **수정(update)·삭제(delete) 정책은 만들지 않는다.**

| 테이블 | 읽기 | 추가 |
|---|---|---|
| places | 누구나(비로그인 포함) | 로그인 사용자, created_by = auth.uid() |
| ranking_lists | 누구나 | 로그인 사용자, user_id = auth.uid() |
| ranking_items | 누구나 | 로그인 사용자, user_id = auth.uid() 이고 list_id의 주인도 auth.uid() |
| tags | 누구나 | 없음(시드만) |
| reviews | 누구나 | 로그인 사용자, user_id = auth.uid() |
| review_tags | 누구나 | 로그인 사용자, user_id = auth.uid() 이고 review_id의 주인도 auth.uid() |
| recommendations | 본인만 | 로그인 사용자, user_id = auth.uid() |
| subscriptions | 본인만 | 로그인 사용자, user_id = auth.uid() |

- 순위·태그 집계를 앱에서 계산하므로 리스트·리뷰는 누구나 읽기. 행에는 uuid만 있고 아이디는 없음
- secret 키는 어디에도 쓰지 않는다
- update 정책이 없으므로 update·delete 쿼리는 에러 없이 0행 처리된다. 코드에 쓰지 않는다

### 4-1. DB 함수 (원자적 저장)
부모 행과 자식 행을 supabase-js로 따로 insert하면 중간 실패 시 자식 없는 리스트·리뷰가 "가장 최근"이 되어 현재 리스트·리뷰가 사라진다. 그래서 두 저장은 함수 하나로 묶는다. 둘 다 `security invoker`(호출자 권한, RLS 그대로 적용).

| 함수 | 인자 | 동작 | 반환 |
|---|---|---|---|
| save_list | p_place_ids bigint[], p_is_onboarding boolean | 개수 3~10·중복 검사 → ranking_lists 1줄 + ranking_items(배열 순서 = rank 1..n) | 새 list id |
| submit_review | p_place_id bigint, p_tag_ids bigint[], p_source text | 태그 1개 이상·source 값 검사 → reviews 1줄 + review_tags | 새 review id |

호출: `supabase.rpc('save_list', { p_place_ids, p_is_onboarding })`. 그룹별 max_select·평가형 1개 검사는 앱(ReviewSheet)에서 한다.
places·recommendations·subscriptions는 한 줄짜리라 직접 insert.

## 5. 계산 규칙 (앱 코드에서 계산, DB 뷰 없음)
전체 조회는 Supabase API 기본 최대 1000행이라 넘으면 에러 없이 잘린다. 해커톤 규모에선 문제없고, 넘으면 `range`로 나눠 조회한다.

### 5-1. 현재 데이터
- 현재 리스트: 사용자별 created_at 최신 ranking_lists의 ranking_items
- 현재 리뷰: (user_id, place_id)별 created_at 최신 reviews + 그 review_tags
- 첫 리뷰: (user_id, place_id)별 created_at 최초 reviews (포인트 계산용)
- created_at이 같으면 id가 큰 쪽을 최신, 작은 쪽을 최초로 본다 (seed처럼 한 번에 넣은 행은 created_at이 같을 수 있음)

### 5-2. 순위 점수 (`lib/ranking.ts`)
- w(r) = 1 / log₂(r + 1)
- S(p) = Σ_u w(r_u(p))  (현재 리스트 기준)
- n_p = p를 현재 리스트에 넣은 사용자 수, S̃(p) = S(p) · n_p / (n_p + 2)
- 순위 노출: n_p ≥ 2. n_p = 1은 "신규 발견"
- 동점: n_p ↓ → 1위 표 수 ↓ → 이름 ↑

### 5-3. 태그 부여 (`lib/tagStats.ts`)
- 윌슨 하한(z = 1.96): LB(k, n) = [p̂ + z²/(2n) − z√(p̂(1−p̂)/n + z²/(4n²))] / (1 + z²/n), p̂ = k/n
- 서술형: n = 해당 그룹 칩을 1개 이상 고른 현재 리뷰 수, k = 그 칩을 고른 수. LB ≥ 0.30이면 부여
- 평가형 긍정: n = 그 그룹 응답 수, k = value +1 응답 수. LB ≥ 0.40이면 "긍정 통과"
- 검산: LB(2,2)=0.342, LB(1,1)=0.207, LB(3,3)=0.438, LB(5,8)=0.306

### 5-4. 필터 (`app/ranking`)
- 대분류: places.category 일치
- 태그 필터: 그룹 안은 OR, 그룹끼리는 AND. 5-3에서 부여된 태그만 인정
- 정렬: S̃ 내림차순

### 5-5. 포인트 (`lib/points.ts`)
첫 리뷰(5-1)마다:
- t = 고른 칩 수, g = 칩을 1개 이상 고른 그룹 수
- 기본: g ≥ 2 이고 t ≥ 3 → 1P
- 개척: 기본 충족 + 이 리뷰 이전에 그 가게에 첫 리뷰를 남긴 다른 사용자 수 < 3 → 1P 대신 2P
- 풍부: g ≥ 5 → +1P (기본 충족 시에만)

온보딩 완주 보너스: 사용자의 is_onboarding = true 리스트의 rank 1~3 가게 모두 기본 충족 첫 리뷰가 있으면 +3P (1회). 기준 리스트는 is_onboarding = true 중 가장 먼저 저장된 것(id 최소)

잔액 = 적립 합 − 3 × (kind = point 인 recommendations 수). 잔액 < 3이면 포인트 추천 버튼 비활성

- 미리보기: ReviewSheet가 열릴 때 `getReviewContext(placeId)`로 { isFirst, pioneer }를 한 번 받고, 칩을 누를 때마다 동기 함수 `previewPoints(tagIds, tags, ctx)`로 계산한다(칩마다 DB 조회 금지). isFirst = false면 0P
- `getReviewContext`는 로그인 세션 사용자 기준(`supabase.auth.getUser`)으로 계산한다
- 시트를 열어둔 사이 다른 사용자 리뷰로 미리보기와 실제 적립이 달라지는 경우는 무시한다
- 온보딩 완료 화면 P = 세 ReviewSheet의 earned 합 + (세 곳 모두 earned > 0이면 3). 신규 사용자에겐 earned > 0 ⇔ 기본 충족 첫 리뷰이므로 §5-5 보너스 조건과 같다
- `getPointBalance`는 userId = 로그인 세션 사용자일 때만 계산하고, 아니면 0 (recommendations는 본인만 읽혀서 남의 차감이 0으로 잡히는 것 방지)
- 온보딩 완주 보너스 계산 시 `lib/points.ts`가 ranking_lists·ranking_items를 직접 읽는다(읽기만)

### 5-6. 추천 (`lib/recommend.ts`)
- 후보: 현재 리스트나 현재 리뷰에 한 번이라도 등장한 가게 − 내 현재 리스트 − (프리미엄 "다시 추천" 시) 직전 결과
- CF: U_p = p를 현재 리스트에 넣은 사용자 집합
  sim(p,q) = |U_p ∩ U_q| / √(|U_p||U_q|),  CF(p) = Σ_{q∈내 리스트} w(r(q)) · sim(p,q),  후보 내 최댓값으로 나눠 0~1
- CB: x(p) = [0.30·onehot(category) ‖ 0.15·cuisine ‖ 0.20·taste ‖ 0.15·mood ‖ 0.20·situation]
  (태그 부분은 5-3 부여 여부 0/1)
  내 취향 c = Σ_{q∈내 리스트} w(r(q)) · x̃(q),  x̃(q): 내가 q에 현재 리뷰가 있으면 태그 부분을 내 선택으로 대체
  CB(p) = cos(c, x(p))
- POP(p) = S̃(p) / max S̃
- α = min(1, k/20), k = 내 리스트와 1곳 이상 겹치는 다른 사용자 수
- score = α·CF + (1−α)·(0.6·CB + 0.4·POP)
- score 동점은 §5-2 동점 규칙(n_p ↓ → 1위 표 수 ↓ → 이름 ↑)
- 사유: 세 항 중 기여 최대 항 기준
  - CF → "〈내 1위 가게〉를 꼽은 사람들이 많이 꼽은 곳"
  - CB → "#〈일치 태그 1~2개〉 취향과 맞음"
  - POP → "국캠 전체 〈n〉위". n은 순위 탭과 같은 기준(n_p ≥ 2 가게만, S̃ 내림차순)의 순위. n_p = 1이면 사유는 "신규 발견"
- 개수·조건
  | kind | 결과 수 | 조건 |
  |---|---|---|
  | free | 1 | 이번 주(월 00:00 KST~) free 기록이 없을 때. 있으면 새로 계산하지 않고 그 결과 표시 |
  | point | 1 | 잔액 ≥ 3 |
  | premium | 5 | hasPremium = true, 횟수 무제한 |
- recommendations insert와 이번 주 free 결과 재사용은 `recommend()` 안에서 처리한다
- 결과가 0곳이면 insert하지 않고 빈 상태 문구를 표시한다 (free 주간 잠김·point 3P 차감 방지)
- free 추천은 화면 진입 시 자동 실행하지 않고 버튼을 눌렀을 때 실행한다 (개발 모드에서 effect가 두 번 실행돼 중복 저장되는 것 방지)
- 포인트 추천 버튼은 요청 중 비활성 (연타로 잔액이 음수가 되는 것 방지)
- 프리미엄 "다시 추천"의 excludeIds는 페이지 상태로 보관한다(새로고침하면 초기화)
- point 추천은 이번 주(월 00:00 KST~)에 내가 받은 free·point 추천 가게를 후보에서 제외 (3P를 내고 같은 가게를 받는 것 방지)
- premium은 이번 주 기록을 빼지 않고 excludeIds만 제외
- `recommend()`가 던지는 에러는 사용자용 한국어 문구(`lib/recommend.ts`에서 상수로 export). 화면은 받은 메시지를 그대로 표시한다

### 5-7. 프리미엄 (`lib/premium.ts`)
- hasPremium(userId) = 본인 subscriptions 중 period_end > now() 가 하나라도 있음
- 결제하기 → subscriptions 한 줄 추가(amount = 1900) → "결제가 완료되었습니다 · 프리미엄 활성화"
- 유료 여부 판정은 이 함수 한 곳에서만

### 5-8. 카카오 → 대분류 (`lib/categorize.ts`)
판정 순서 (위에서 먼저 걸리는 것)
1. category_name 어디든 "샐러드" 포함 → 샐러드·건강식
2. 3번째 단어가 "피자" → 버거·피자 (카카오가 피자를 "양식 > 피자"로 주는 경우 대비)
3. category_group_code = CE7 → 카페·디저트
4. " > "로 나눈 2번째 단어로 아래 표
| 카카오 | 대분류 |
|---|---|
| 한식 | 한식 |
| 중식 | 중식 |
| 일식 | 일식 |
| 양식 | 양식 |
| 아시아음식 | 아시안 |
| 분식 | 분식 |
| 치킨 | 치킨 |
| 패스트푸드 | 버거·피자 |
| 술집 | 술집 |
| 간식, 카페(그룹 CE7) | 카페·디저트 |
| 그 외 | 기타 |

## 6. tags 시드
| group_key | group_label | kind | max | 칩 |
|---|---|---|---|---|
| cuisine | 음식 종류 | descriptive | 2 | 한식: 국밥·해장국, 찌개·백반, 고기·구이, 면·칼국수, 족발·보쌈, 찜·탕 / 중식: 짜장·짬뽕, 마라, 양꼬치 / 일식: 돈까스, 초밥·회, 라멘·우동, 덮밥 / 양식: 파스타, 스테이크, 브런치 / 아시안: 쌀국수, 태국, 인도·커리 / 분식: 떡볶이, 김밥 / 치킨: 치킨 / 버거·피자: 버거, 피자 / 샐러드·건강식: 샐러드·포케 / 카페·디저트: 커피, 베이커리·디저트 / 술집: 호프, 이자카야, 포차 |
| taste | 맛 스타일 | descriptive | 3 | 매운, 얼큰한, 담백한, 짭짤한, 달달한, 고소한, 진한, 느끼한, 자극적인, 깔끔한 |
| mood | 분위기 | descriptive | 2 | 아늑한, 세련된, 시끌벅적한, 조용한, 감성적인, 노포 |
| situation | 상황 | descriptive | 3 | 데이트, 밥약, 혼밥, 단체·회식, 술자리, 손님 대접, 빠른 한 끼, 해장 |
| price | 가격대 | descriptive | 1 | 1인 1만 원 이하, 1~2만 원, 2만 원 이상 |
| clean | 청결도 | evaluative | 1 | 깨끗함(+1), 보통(0), 아쉬움(−1) |
| kind | 친절 | evaluative | 1 | 친절함(+1), 보통(0), 아쉬움(−1) |
| value | 가성비 | evaluative | 1 | 좋음(+1), 보통(0), 비쌈(−1) |
| portion | 양 | evaluative | 1 | 푸짐(+1), 보통(0), 적음(−1) |
| wait | 대기 | evaluative | 1 | 바로 입장(+1), 조금 대기(0), 오래 대기(−1) |

시드 총 72행 (cuisine 30 + taste 10 + mood 6 + situation 8 + price 3 + 평가형 5×3).
리뷰 시트의 cuisine 칩은 가게 category와 같은 parent_label 칩만 보여준다(기타면 전부).
화면 표시 순서는 그룹을 이 표 순서(cuisine → wait)로, 그룹 안은 sort 순. sort는 그룹마다 1부터 다시 시작한다.

## 7. 인증
- Supabase Auth 이메일 로그인 사용. 아이디 `soono` → 이메일 `soono@users.mechuri.app` 으로 변환해서 가입·로그인
- 아이디 규칙: 4~20자, 영문 소문자·숫자·밑줄. 입력은 소문자로 변환
- 비밀번호 8자 이상(앱에서 검사)
- Supabase 대시보드 Authentication → Email에서 **Confirm email 끔** (팀장)
- 화면에 표시하는 아이디 = 이메일의 @ 앞부분
- Top 3 미입력자: 추천 탭 잠금 + 앱을 열 때마다 입력 유도 모달 1회 + 순위 탭 상단 배너
- Top 3 미입력자의 추천 탭 잠금 화면은 `app/recommend`(B)가 그린다

## 8. 카카오 검색
- `GET /api/places/search?q=검색어` (서버 라우트, REST 키는 서버에서만)
- 호출: `https://dapi.kakao.com/v2/local/search/keyword.json?query=…&x=126.669&y=37.382&radius=3000&sort=distance`
  헤더 `Authorization: KakaoAK {KAKAO_REST_API_KEY}`
  중심 좌표는 국제캠퍼스 대략값 — 지도에서 확인 후 수정
- 결과 중 category_group_code가 FD6(음식점)·CE7(카페)인 것만 돌려줌
- API 라우트는 카카오 결과를 `KakaoPlace[]`(§10)로 바꿔 돌려주기만 하고 DB에 쓰지 않는다
- 선택 시(브라우저, `lib/places.ts`의 `ensurePlace`): places에 kakao_place_id가 있으면 그 행 사용, 없으면 추가(동시 추가로 중복 오류가 나면 다시 조회). category는 `toCategory`로 계산

## 9. 환경변수
| 이름 | 어디에 | 공개 |
|---|---|---|
| NEXT_PUBLIC_SUPABASE_URL | .env.local, Vercel | 공개 가능 |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | .env.local, Vercel | 공개 가능 |
| KAKAO_REST_API_KEY | .env.local, Vercel | **비공개, NEXT_PUBLIC_ 금지** |
| NEXT_PUBLIC_KAKAO_MAP_KEY | .env.local, Vercel | 공개 가능(도메인 제한), 지도 구현 시 |

`.env.example`에는 이름만 적는다.

## 10. 파일과 담당 (남의 파일은 고치지 않는다)
| 파일 | 담당 | 내용 |
|---|---|---|
| CLAUDE.md | A | Claude Code 작업 규칙 (WORK_SPLIT §11) |
| lib/types.ts | A(뼈대) | 공통 타입. 바꾸려면 plan.md §10 먼저 |
| lib/supabase.ts | A | Supabase 클라이언트 |
| lib/places.ts | A | ensurePlace(kakaoPlace), getPlaces(ids?) |
| lib/auth.ts | A | signUp(id,pw), signIn(id,pw), signOut(), useUser() |
| lib/lists.ts | A | getCurrentList(userId), getAllCurrentLists(), saveList(placeIds, isOnboarding) |
| lib/categorize.ts | A | toCategory(categoryName, groupCode) |
| app/api/places/search/route.ts | A | 카카오 검색 |
| app/layout.tsx, components/BottomTabs.tsx, components/OnboardingNag.tsx | A | 공통 레이아웃·하단 탭·유도 모달 |
| app/login/page.tsx | A | 로그인·가입 |
| app/onboarding/page.tsx | A | Top 3 선택 → ReviewSheet(embedded) × 3 → 완료 |
| app/my-list/page.tsx | A | 내 맛집 편집(저장 = 새 리스트) |
| components/PlaceSearch.tsx | A | 검색창 + 결과 + 선택 |
| lib/tags.ts | B | getTags(), 그룹 묶기, 타입 |
| lib/reviews.ts | B | submitReview(placeId, tagIds, source), getCurrentReviews(), getFirstReviews() |
| lib/points.ts | B | getPointBalance(userId), getReviewContext(placeId), previewPoints(tagIds, tags, ctx) |
| lib/recommend.ts | B | recommend(userId, kind, excludeIds?) |
| components/ReviewSheet.tsx | B | 칩 선택 시트 |
| app/recommend/page.tsx | B | 추천 탭 |
| lib/ranking.ts | C | computeScores(allLists) |
| lib/tagStats.ts | C | wilsonLB(k,n), computeTagStats(currentReviews, tags) |
| lib/premium.ts | C | hasPremium(userId), buyPremium() |
| app/ranking/page.tsx, components/FilterSheet.tsx | C | 순위 탭 |
| components/PlaceDetail.tsx | C | 가게 상세 시트 |
| components/KakaoMap.tsx | C | 지도(여유 있을 때) |
| components/RecommendMap.tsx | B | 추천 가게 지도 |
| components/EggHatch.tsx, components/EggHatch.module.css | B | 추천 탭 알 깨기 연출(§1 화면 3) |
| public/brand/mechuri-mascot.svg | B | 메추리 캐릭터 그림 |
| app/me/page.tsx, app/premium/page.tsx | C | 마이(포인트 표시·프리미엄), 모의 결제 |

### 함수 약속 (먼저 이 모양대로 만들고 속은 나중에 채운다)
타입은 전부 `lib/types.ts`에서 import한다. 각자 파일에 같은 타입을 다시 정의하지 않는다.
```ts
// A — lib/types.ts (뼈대에서 생성)
export type Category = '한식' | '중식' | '일식' | '양식' | '아시안' | '분식' | '치킨'
  | '버거·피자' | '샐러드·건강식' | '카페·디저트' | '술집' | '기타';
export type Place = { id: number; kakaoPlaceId: string; name: string; address: string;
  category: Category; kakaoCategory: string; lat: number; lng: number };
export type KakaoPlace = { kakaoPlaceId: string; name: string; address: string;
  categoryName: string; groupCode: string; lat: number; lng: number };
export type ListItem = { placeId: number; rank: number };
export type Tag = { id: number; groupKey: string; groupLabel: string;
  groupKind: 'descriptive' | 'evaluative'; maxSelect: number; label: string;
  parentLabel: string | null; value: number | null; sort: number };
export type CurrentReview = { reviewId: number; userId: string; placeId: number;
  tagIds: number[]; createdAt: string };
export type ReviewSource = 'onboarding' | 'review' | 'list_add';
export type RecKind = 'free' | 'point' | 'premium';
export type RecItem = { placeId: number; reason: string };

// A — lib/auth.ts
signUp(id: string, pw: string): Promise<void>
signIn(id: string, pw: string): Promise<void>
signOut(): Promise<void>
useUser(): { user: { id: string; username: string } | null; loading: boolean }

// A — lib/places.ts
ensurePlace(k: KakaoPlace): Promise<Place>
getPlaces(ids?: number[]): Promise<Map<number, Place>>   // ids 없으면 전체

// A — lib/lists.ts
getCurrentList(userId: string): Promise<ListItem[]>
getAllCurrentLists(): Promise<Map<string, ListItem[]>>   // key = userId
saveList(placeIds: number[], isOnboarding: boolean): Promise<number>  // rpc save_list

// A — lib/categorize.ts
toCategory(categoryName: string, groupCode: string): Category

// B — components/ReviewSheet.tsx
type ReviewSheetProps = {
  placeId: number;
  placeCategory: Category;
  source: ReviewSource;
  embedded?: boolean;              // 온보딩 화면 안에 끼울 때 true
  onDone: (earned: number) => void; // 제출 또는 건너뛰기 후 호출(건너뛰기면 0)
};

// B — lib/tags.ts
getTags(): Promise<Tag[]>

// B — lib/reviews.ts
submitReview(placeId: number, tagIds: number[], source: ReviewSource): Promise<number> // rpc submit_review
getCurrentReviews(): Promise<CurrentReview[]>
getFirstReviews(): Promise<CurrentReview[]>

// B — lib/points.ts
getPointBalance(userId: string): Promise<number>
getReviewContext(placeId: number): Promise<{ isFirst: boolean; pioneer: boolean }>
previewPoints(tagIds: number[], tags: Tag[], ctx: { isFirst: boolean; pioneer: boolean }): number

// B — lib/recommend.ts
recommend(userId: string, kind: RecKind, excludeIds?: number[]): Promise<RecItem[]>

// C — lib/ranking.ts
computeScores(lists: Map<string, ListItem[]>):
  Map<number, { score: number; n: number; nFirst: number }>   // score = S̃

// C — lib/tagStats.ts
wilsonLB(k: number, n: number): number
computeTagStats(reviews: CurrentReview[], tags: Tag[]):
  Map<number, { assignedTagIds: number[]; positive: string[] /* 통과한 평가형 group_key */ }>

// C — lib/premium.ts
hasPremium(userId: string): Promise<boolean>
buyPremium(): Promise<void>
```

## 11. 우선순위 (해커톤)
1. **필수** (데모 핵심): 가입·로그인 / 검색 + Top 3 저장 / 온보딩 태그 입력 / 순위 목록 + 대분류 필터 / 태그 집계 함수 computeTagStats(추천 CB가 사용) / 무료 추천 1곳
2. **목표**: 태그 필터 UI / 가게 상세 + 간단 리뷰 / 포인트 표시·포인트 추천 / 모의 결제 + 프리미엄 5곳 / 내 맛집 편집
3. **여유**: 카카오 지도 뷰 / 추천 탭 지도 / 유도 모달·배너 다듬기 / 취향 분석

## 12. 해커톤에서 뺀 것·바꾼 것 (기획서 대비)
Claude Code가 기획서를 보고 아래 항목을 구현하지 않도록 전부 적는다.

**뺀 것**: 배달 기능 전부, 학교 인증, 관리자 페이지·검수 큐·제보, 대표 메뉴·메추리 픽, 세부 조건 추천(유료 후속), 구독 해지, 포인트 주간 한도·회수·소멸, 폐업 처리, IP 가입 제한, 로그인 실패 잠금, 비밀번호 재발급, 저장·리뷰·추천 빈도 제한, 리뷰·리스트 삭제, Region(지역) 테이블·서비스 지역 밖 차단, 초기 음식점 일괄 수집, 소분류 자동 분류·관리자 보정, 태그 그룹 관리자 편집, 취향 분석(F-14, 여유 시), 필터 상태 URL 쿼리, PWA, 추천 API 서버 차단(403)

| 기획서 | plan.md (해커톤) | 이유 |
|---|---|---|
| 리뷰 1인 1가게 upsert | 추가만, 최신이 현재 리뷰 | update 정책 없이 RLS 단순화 |
| RankingEntry(사용자별 현재 순위) | ranking_lists 스냅샷, 최신이 현재 | 위와 같음, 이력 보존 |
| PointLedger 원장 | reviews·recommendations에서 계산 | 테이블·쓰기 경로 축소 |
| PlaceScore·PlaceTagStat 캐시 | 앱에서 매번 계산 | 데이터 수십~수백 행 |
| 대분류·소분류 2단 Category 테이블 | places.category 문자열 + cuisine 칩 | 관리자 없음 |
| CB = 0.40 소분류 ‖ 0.25 맛 ‖ 0.15 분위기 ‖ 0.20 상황 | §5-6 (대분류 원핫 추가, cuisine 칩 사용) | 소분류 자동 분류가 없음 |
| Subscription 상태·PaymentProvider | subscriptions 결제 1회 = 1줄, period_end > now() | 모의 결제만 |
| 개척: 그 가게 리뷰 < 3건 | 그 가게 첫 리뷰 남긴 다른 사용자 < 3 | 추가만 구조에서 같은 의미 |

## 13. 디자인 규칙 (B 화면에 먼저 적용, 공통 적용은 순오 검토 후)
국캠 학생이 카톡 링크로 들어와 30초 안에 오늘 갈 곳을 정하는 모바일 화면. 한 손 엄지 기준.

| 이름 | 값 | 쓰는 곳 |
|---|---|---|
| 잉크 | #2A211B | 본문 글자 |
| 고추장 | #D63A26 | 주 행동 버튼, 선택된 칩 |
| 노른자 | #FFB547 | 포인트 배지(+N P, 잔액) |
| 반점 | #7A5B43 | 보조 글자 |
| 선 | #E7E3DE | 테두리·구분선 |
| 바탕 / 옅은 바탕 | #FFFFFF / #F5F4F2 | 배경 |
| 지도 점 | 1명 #FFD3A1 / 2~3명 #FF8A3D / 4명 이상 #D2301E | 추천 지도(n_p) |

- 글꼴: 제목·가게 이름·숫자는 Do Hyeon(`next/font/google`), 본문은 시스템 글꼴. 지금은 B 파일 안에서만 불러온다(layout.tsx 미수정)
- 강조는 한 곳만: 이번 주 무료 추천 카드만 연한 메추리알 반점 무늬를 깐 유일한 카드. 3P·프리미엄 결과는 구분선 목록
- 움직임: 추천 결과가 나타날 때 한 번만 짧게 커지며 등장. prefers-reduced-motion이면 끔
- 칩: 완전 둥글게, 미선택은 선만, 선택은 고추장 채움 + 흰 글자. 그룹 제목은 작고 굵게(대문자 라벨·눈썹 라벨 금지), 그룹 사이 간격 넉넉히
- 버튼: 가로 꽉 차게, 높이 52px 이상, 살짝 둥글게(칩과 위계 구분). 글자 끝 화살표(→) 금지
- 피할 것: 모든 덩어리를 같은 둥근 카드로 쪼개기, 회색 그림자 남발, 그라데이션 장식
