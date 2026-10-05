# 메추리 — 분업 가이드 (1조)

기준 문서: `plan.md`. 이 가이드는 "누가, 언제, 무엇을, 어떤 프롬프트로"만 다룬다.

## 0. 역할

| 역할 | 이름 | 맡는 것 | 브랜치 |
|---|---|---|---|
| A (팀장) | ______ | Supabase·뼈대, 로그인·가입, 가게 검색, 온보딩, 내 맛집 | feat/a-* |
| B | ______ | 태그 리뷰 시트, 포인트, 추천 탭 | feat/b-* |
| C | ______ | 순위 탭·필터, 가게 상세, 마이·모의 결제, 지도 | feat/c-* |

파일 단위 담당은 plan.md §10. **남의 파일은 고치지 않는다.** 필요하면 채팅으로 요청한다.

## 1. 미리 각자 할 것 (세션 전)
- [ ] Node 20 이상, git, Cursor + Codex(또는 Claude Code) 동작 확인
- [ ] GitHub 팀 저장소 초대 수락
- [ ] 카카오 디벨로퍼스(developers.kakao.com)에서 **각자** 앱 하나 생성
  - 플랫폼 → Web → 사이트 도메인 `http://localhost:3000` 등록
  - REST API 키, JavaScript 키 확인(본인 `.env.local`에만 씀. 채팅에 붙이지 않기)
  - 팀장은 추가로 Vercel 배포 도메인도 등록

## 2. 세션 타임라인

| 시각 | 팀 전체 | A (팀장) | B · C |
|---|---|---|---|
| 0:00 | 설계 ① plan.md §1 화면 3장 함께 읽기 | Supabase 프로젝트 생성(이름 = 저장소 이름, Region Seoul, DB 비밀번호는 팀장만 보관) → B·C 초대 | |
| 0:05 | 설계 ②~④ §2~§4 검토, 바꿀 것 합의 | | Supabase 초대 수락 |
| 0:17 | 설계 ⑤ plan.md 확정 → main에 올림 | | |
| 0:20 | | 설계 ⑥ schema.sql 생성 → SQL Editor 실행 → Confirm email 끄기 → 뼈대 PR | `.env.local` 작성 |
| 0:30~ | 각자 브랜치에서 기능 루프(§5) | 뼈대 merge 후 A 작업 | 뼈대 merge 후 pull → B·C 작업 |

설계 ②~④에서 바꾼 게 있으면 plan.md를 먼저 고치고 확정한다. plan.md는 이미 초안이 있으므로 0:05~0:17은 **검토·수정** 시간이다.

## 3. 팀장 한 번만 하는 세팅

### 3-1. schema.sql 실행
1. 설계 ⑥ 프롬프트(§7-2)로 schema.sql 생성
2. Supabase → SQL Editor → 붙여넣기 → Run
3. Table Editor에서 확인
   - [ ] 테이블 8개(places, ranking_lists, ranking_items, tags, reviews, review_tags, recommendations, subscriptions)
   - [ ] 모든 테이블 RLS 켜짐
   - [ ] tags에 시드 행 72줄이 들어가 있음
4. Authentication → Sign In / Providers → Email → **Confirm email 끔**

### 3-2. 뼈대 PR (B·C가 여기서 출발)
한 PR에 아래를 모두 넣는다.
- [ ] Next.js(App Router, TypeScript, Tailwind) 초기화
- [ ] `plan.md`, `schema.sql`, `docs/product-spec.md`
- [ ] `.env.example` (키 이름만 4개, plan.md §9)
- [ ] `lib/supabase.ts` 연결 파일
- [ ] `components/BottomTabs.tsx` + `app/layout.tsx` (탭: 순위 / 추천 / 내 맛집 / 마이)
- [ ] **plan.md §10의 모든 파일을 빈 껍데기로 생성**: 함수는 §10 "함수 약속" 모양 그대로, 속은 더미값 반환. 페이지는 제목만
  → 이렇게 해야 B·C가 A를 기다리지 않고 import해서 쓸 수 있다

### 3-3. Vercel
- [ ] 저장소 연결 → 환경변수 4개 등록 → 배포
- [ ] 배포 도메인을 본인 카카오 앱 Web 도메인에 추가

## 4. 팀원 합류 시 한 번
- [ ] Supabase 초대 메일 Accept → 대시보드에서 팀 프로젝트 확인
- [ ] Project Settings → API Keys에서 Project URL, publishable 키를 **직접 복사**해 `.env.local` 작성
- [ ] 카카오 키 2개는 본인 카카오 앱 것으로 `.env.local`에 추가
- [ ] 뼈대 PR merge 후 `git pull` → `npm install` → `npm run dev` → localhost:3000에 탭 4개가 보이면 준비 완료

`.env.local` 예시 (값은 각자)
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
KAKAO_REST_API_KEY=
NEXT_PUBLIC_KAKAO_MAP_KEY=
```

## 5. 기능 만들 때마다 도는 루프
1. 테이블을 바꿔야 하면 → **먼저 채팅에 알림** ("reviews에 열 추가하려고 함")
2. plan.md부터 수정 → AI에게 변경 SQL 받기 → schema.sql 끝에 추가 → SQL Editor 실행 → 같은 내용 PR
3. AI에게 기능 요청할 때 `@plan.md`와 담당 파일을 `@`로 지정
4. Table Editor에서 행이 실제로 생겼는지 눈으로 확인 ("완료했습니다"를 믿지 않기)
   - 4-1. 표엔 있는데 앱에 안 보이면 → RLS부터 확인(규칙이 없으면 에러 없이 빈 목록)
5. merge 후 Vercel 배포 → 폰으로 한 번 더 확인

PR은 작게, 자주. merge 전 `git pull origin main`으로 최신 main을 받아 충돌을 먼저 해결한다.

## 6. 개인별 작업 순서

### A — 로그인·검색·온보딩·내 맛집
| 순서 | 우선순위 | 작업 | 완료 확인 |
|---|---|---|---|
| A1 | 필수 | `lib/auth.ts` + `app/login` (아이디→`@users.mechuri.app` 변환, 8자 검사) | 가입하면 Authentication → Users에 `아이디@users.mechuri.app` 생김 |
| A2 | 필수 | `api/places/search` + `PlaceSearch` + `categorize` | "국밥" 검색 시 국캠 근처 결과, 선택하면 places에 행 추가 |
| A3 | 필수 | `lib/lists.ts` + 온보딩 1단계(Top 3 선택·순서) | 저장 시 ranking_lists 1줄(is_onboarding=true) + ranking_items 3줄 |
| A4 | 필수 | 온보딩 2·3단계: B의 `ReviewSheet embedded` × 3 → 완료 화면 | 3곳 입력 후 "+N P" 완료 화면, 버튼으로 추천 탭 이동 |
| A5 | 목표 | `app/my-list` 편집(추가·삭제·순서, 3~10개 검사, 저장 = 새 리스트) | 저장할 때마다 ranking_lists 새 줄 |
| A6 | 여유 | `OnboardingNag`: Top 3 없으면 앱 열 때 모달 1회 + 추천 탭 잠금 | 새 계정으로 확인 |

B의 ReviewSheet가 아직 껍데기면 A4는 "건너뛰기"만 동작하는 상태로 먼저 연결해둔다.

### B — 태그 리뷰·포인트·추천
| 순서 | 우선순위 | 작업 | 완료 확인 |
|---|---|---|---|
| B1 | 필수 | `lib/tags.ts` + `components/ReviewSheet` (그룹별 칩, 최대 선택 수, 평가형 3단, cuisine은 가게 대분류 칩만) | 제출 시 reviews 1줄 + review_tags N줄 |
| B2 | 필수 | ReviewSheet 상단 "입력한 정보 N개 · +N P" 실시간 표시(`previewPoints`) | 칩 누를 때마다 숫자 변함 |
| B3 | 필수 | `lib/recommend.ts` 무료 1곳 + `app/recommend` | 같은 주 두 번째엔 저장된 결과가 뜸 |
| B4 | 목표 | `lib/points.ts` 잔액 계산 + "3P로 한 번 더" | 잔액 3 줄고 recommendations(kind=point) 1줄 |
| B5 | 목표 | 프리미엄이면 5곳 + "다시 추천"(직전 제외) | C의 `hasPremium` 사용 |

A·C 작업 전 테스트 데이터: 앱 가입 화면이 아직 없으면 Supabase → Authentication → Add user로 `test1@users.mechuri.app` 등 3명 생성 후, Table Editor로 places·ranking_lists·ranking_items 몇 줄 직접 입력.

### C — 순위·상세·마이·결제
| 순서 | 우선순위 | 작업 | 완료 확인 |
|---|---|---|---|
| C1 | 필수 | `lib/ranking.ts` + `app/ranking` 목록 + 대분류 칩 | 테스트 데이터 손계산 점수와 일치, n=1은 "신규 발견" |
| C2 | 목표 | `lib/tagStats.ts` + `FilterSheet` (그룹 내 OR, 그룹 간 AND) | LB(2,2)=0.342 등 plan.md §5-3 검산값 일치 |
| C3 | 목표 | `PlaceDetail` 시트: 태그·평가 분포, B의 ReviewSheet, A의 "내 맛집에 추가" | 상세에서 리뷰 제출 → 태그 갱신 |
| C4 | 목표 | `lib/premium.ts` + `app/premium` 모의 결제 + `app/me`(아이디, 포인트, 프리미엄 만료일) | 결제하기 → subscriptions 1줄, 완료 화면 |
| C5 | 여유 | `KakaoMap` 목록/지도 토글, 상위 30개 핀 | 핀 탭 → 상세 |

## 7. 복붙용 프롬프트

### 7-1. 설계 ②~④ 검토 (팀 전체, 0:05)
```
@plan.md 는 우리 팀 설계 초안이야. 코드는 아직 만들지 마.
1) §1 화면 3장의 [저장] 표시가 §2 테이블에 모두 들어가는지 대조해줘.
2) §3 열 이름이 영어 소문자_밑줄 규칙, 종류가 글자·숫자·시각·참거짓 중 하나인지 확인해줘.
3) 이 표만으로 가입→Top 3 저장→순위 보기→추천 받기가 되는지 순서대로 따라가 봐.
4) 빼도 되는 개인정보가 있는지 알려줘.
문제만 목록으로 답해줘.
```

### 7-2. 설계 ⑥ SQL 만들기 (팀장, 0:20)
```
@plan.md 대로 Supabase용 schema.sql 하나만 만들어줘. 다른 파일은 건드리지 마.
- §2~§3 테이블·열·제약, id는 identity, created_at 기본값 now(), user_id·created_by 기본값 auth.uid()
- subscriptions.period_end 기본값 now() + interval '30 days'
- §4 RLS: 모든 테이블 enable, select·insert 정책만. update·delete 정책은 만들지 마
- ranking_items·review_tags insert는 부모 행의 user_id가 auth.uid()인지도 확인
- §6 tags 시드 insert 포함
- 한 번에 실행 가능하게, 다시 실행해도 에러 안 나게 if not exists 사용
```

### 7-3. 뼈대 PR (팀장)
```
@plan.md 기준으로 Next.js(App Router, TypeScript, Tailwind) 뼈대를 만들어줘.
- lib/supabase.ts: @supabase/supabase-js 브라우저 클라이언트, 환경변수는 §9 이름 사용
- .env.example: §9 이름만
- app/layout.tsx + components/BottomTabs.tsx: 순위 /ranking, 추천 /recommend, 내 맛집 /my-list, 마이 /me
- §10 표의 모든 파일을 생성하되, 함수는 "함수 약속" 시그니처 그대로 두고 더미값을 반환해. 페이지는 제목만.
- 기능 구현은 하지 마.
```

### 7-4. 각자 첫 작업 (0:30~)
A
```
@plan.md §7 §8 §10 을 읽고 내 담당 파일 lib/auth.ts, app/login/page.tsx 를 구현해줘.
아이디는 소문자로 바꿔 "아이디@users.mechuri.app" 이메일로 Supabase Auth 가입·로그인.
아이디 4~20자 영문 소문자·숫자·밑줄, 비밀번호 8자 이상 검사. 다른 사람 담당 파일은 수정하지 마.
```
B
```
@plan.md §3 tags·reviews·review_tags, §5-5, §6, §10 을 읽고
lib/tags.ts, lib/reviews.ts, components/ReviewSheet.tsx 를 구현해줘.
ReviewSheetProps는 §10 약속 그대로. 그룹별 max_select 지키고, 평가형은 3단 중 하나만.
cuisine 칩은 placeCategory와 parent_label이 같은 것만(기타면 전부). 다른 사람 담당 파일은 수정하지 마.
```
C
```
@plan.md §5-1 §5-2 §5-4 §10 을 읽고 lib/ranking.ts 와 app/ranking/page.tsx 를 구현해줘.
현재 리스트는 A의 getAllCurrentLists()로 받아와. 대분류 칩 필터, n≥2만 순위, n=1은 "신규 발견" 섹션.
다른 사람 담당 파일은 수정하지 마.
```

### 7-5. 루프용 템플릿
```
@plan.md 의 〈테이블〉에 @〈내 담당 파일〉 로 〈기능〉을 만들어줘.
완료 조건: 〈Table Editor에서 무엇이 보이면 성공인지〉. 다른 사람 담당 파일은 수정하지 마.
```

## 8. 연결 지점 (여기서 자주 깨진다)
| 쓰는 쪽 | 가져다 쓰는 것 | 만드는 쪽 |
|---|---|---|
| A 온보딩 | ReviewSheet(embedded) | B |
| C 상세 | ReviewSheet, saveList | B, A |
| B 추천 | getAllCurrentLists, getCurrentList | A |
| B 추천 | computeScores, computeTagStats, hasPremium | C |
| C 마이 | getPointBalance | B |

약속한 함수 모양을 바꿔야 하면 plan.md §10을 먼저 고치고 채팅에 알린다.

## 9. 데모 시나리오 (마지막 20분 리허설)
1. 새 아이디로 가입 → 온보딩 Top 3 검색·선택
2. 가게마다 칩 입력 → 상단 포인트가 올라감 → 완료 화면 "+N P"
3. 첫 추천 받기 → 1곳 + 사유
4. 순위 탭 → 한식 → 필터 "얼큰한 + 혼밥" → 결과
5. 가게 상세 → 간단 리뷰 → 태그 반영
6. 마이 → 프리미엄 결제하기 → "결제가 완료되었습니다" → 추천 5곳

리허설 전 체크
- [ ] 테스트 계정 5개 이상으로 리스트·리뷰를 넣어 순위와 태그가 채워져 있음 (n≥2, 태그 LB 통과)
- [ ] Vercel 배포본에서 폰으로 1~6 전부 확인
- [ ] 저장소·코드 어디에도 secret 키 없음

## 10. 회차 끝날 때 (atlas-prompts)
1. Cursor 창 제목이 atlas-prompts인지 확인
2. main pull
3. 브랜치 생성 `prompts/〈이름〉-h2`
4. README의 한 줄 스크립트 실행, 대상은 이번 회차 팀 폴더
5. `prompts/〈이름〉/`에 생긴 파일 열기
6. 비밀값·사적인 대화 삭제
7. commit → push → PR
8. 학회장 승인 후 merge
