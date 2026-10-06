'use client';
// 담당 B — plan.md §10 추천 탭 (화면 3), §5-5, §5-6, §5-7, §7
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Do_Hyeon } from 'next/font/google';
import type { Category, Place, RecItem, RecKind } from '@/lib/types';
import EggHatch, {
  EMPTY_EGG_MESSAGE,
  HATCH_PAGE_Z,
  layingMessage,
  mealNow,
  type Meal,
} from '@/components/EggHatch';
import RecommendMap from '@/components/RecommendMap';
import { useUser } from '@/lib/auth';
import { getAllCurrentLists, getCurrentList } from '@/lib/lists';
import { getPlaces } from '@/lib/places';
import { getPointBalance } from '@/lib/points';
import { hasPremium } from '@/lib/premium';
import {
  LOAD_FAILED_MESSAGE,
  daysUntilNextFree,
  getThisWeekFree,
  recommend,
} from '@/lib/recommend';

/** §7 Top 3 미입력자는 추천 탭 잠금 */
const MIN_LIST = 3;

/** §5-5 포인트 추천 1회 비용 */
const POINT_COST = 3;

type Shown = { placeId: number; name: string; category: Category | null; reason: string };

/**
 * result = null이면 이번 주 free 기록 없음.
 * pointResult·premiumResult = null이면 아직 요청 안 함.
 * premiumExclude = 직전 프리미엄 5곳의 placeId. 페이지 상태라 새로고침하면 초기화 (§5-6)
 * myPlaceIds = 내 현재 리스트 가게 (지도의 회색 점)
 */
type Loaded = {
  userId: string;
  listCount: number;
  myPlaceIds: number[];
  result: Shown[] | null;
  balance: number;
  premium: boolean;
  pointResult: Shown[] | null;
  premiumResult: Shown[] | null;
  premiumExclude: number[];
};

// plan.md §13 디자인 규칙 — 제목·가게 이름·숫자는 Do Hyeon, 본문은 시스템 글꼴
const display = Do_Hyeon({ weight: '400', subsets: ['latin'], fallback: ['system-ui', 'sans-serif'] });
const SYSTEM_FONT =
  "system-ui, -apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', sans-serif";

const INK = 'text-[#2A211B] dark:text-[#F2ECE6]';
const MUTED = 'text-[#7A5B43] dark:text-[#C9AE95]';
const LINE = 'border-[#E7E3DE] dark:border-white/15';

const BUTTON =
  'flex min-h-[52px] w-full items-center justify-center rounded-lg px-4 py-3 font-medium';
/** 주 행동: 고추장 채움 */
const PRIMARY = `${BUTTON} bg-[#D63A26] text-white disabled:opacity-40`;
/** 보조 행동: 선만 */
const SECONDARY = `${BUTTON} border border-[#E7E3DE] disabled:opacity-40 dark:border-white/20`;

/** 결과가 나타날 때 한 번만 짧게 커지며 등장. 동작 줄이기 설정이면 끔 (§13) */
const APPEAR =
  'transition duration-200 ease-out starting:scale-95 starting:opacity-0 motion-reduce:transition-none';

/** 메추리알 반점 — 이번 주 무료 추천 카드에만 (§13 강조는 한 곳만) */
const SPECKLE = [
  'radial-gradient(circle at 14% 22%, rgba(122,91,67,0.16) 0 4px, transparent 5px)',
  'radial-gradient(circle at 83% 16%, rgba(122,91,67,0.11) 0 9px, transparent 10px)',
  'radial-gradient(circle at 92% 68%, rgba(122,91,67,0.14) 0 3px, transparent 4px)',
  'radial-gradient(circle at 70% 88%, rgba(122,91,67,0.09) 0 12px, transparent 13px)',
  'radial-gradient(circle at 6% 80%, rgba(122,91,67,0.12) 0 6px, transparent 7px)',
].join(', ');

async function toShown(items: RecItem[]): Promise<Shown[]> {
  const places = await getPlaces(items.map((i) => i.placeId));
  return items.map((i) => {
    const place = places.get(i.placeId);
    return {
      placeId: i.placeId,
      name: place?.name ?? '알 수 없는 가게',
      category: place?.category ?? null,
      reason: i.reason,
    };
  });
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** recommend()가 던지는 문구는 그대로 쓰고(§5-6), 가게 이름 조회 실패는 같은 사용자용 문구로 바꾼다 */
async function fetchShown(userId: string, kind: RecKind, excludeIds?: number[]): Promise<Shown[]> {
  const items = await recommend(userId, kind, excludeIds);
  try {
    return await toShown(items);
  } catch (e) {
    console.error('[recommend page]', e);
    throw new Error(LOAD_FAILED_MESSAGE);
  }
}

/** 알 깨기 연출 중인 추천. outcome은 recommend() 응답이 오면 found(1곳 이상)·empty(0곳) */
type Hatch = { kind: RecKind; outcome: 'pending' | 'found' | 'empty' };

/** 동작 줄이기 설정이면 연출 없이 결과만 보여준다 */
function wantsMotion(): boolean {
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 5단계에서 페이지를 연출 층 위로 올려 금 위치의 틈에서 벌린다 */
const REVEAL_STYLE: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: HATCH_PAGE_Z,
  overflow: 'hidden',
  background: 'var(--background)',
};
/** layout.tsx의 body·main과 같은 폭·여백 → 일반 흐름으로 돌아갈 때 내용이 제자리 */
const REVEAL_INNER = 'mx-auto w-full max-w-md px-4 py-4';

/** 이번 주 무료 추천 — 반점 무늬를 깐 유일한 카드 */
function FreeCard({ items, daysLeft }: { items: Shown[]; daysLeft: number }) {
  return (
    <div
      className={`${APPEAR} flex flex-col gap-4 rounded-2xl border ${LINE} bg-[#F5F4F2] p-5 dark:bg-white/5`}
      style={{ backgroundImage: SPECKLE, backgroundRepeat: 'no-repeat' }}
    >
      {items.map((r) => (
        <div key={r.placeId} className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className={`${display.className} text-3xl leading-tight`}>{r.name}</span>
            {r.category && <span className={`text-sm ${MUTED}`}>{r.category}</span>}
          </div>
          <p>&ldquo;{r.reason}&rdquo;</p>
        </div>
      ))}
      <p className={`text-sm ${MUTED}`}>
        다음 무료 추천까지 <span className={`${display.className} text-base`}>{daysLeft}</span>일
      </p>
    </div>
  );
}

/** 3P·프리미엄 결과 — 카드 없이 구분선 목록 */
function PlaceList({ items }: { items: Shown[] }) {
  return (
    <ul className={`${APPEAR} flex flex-col divide-y border-y ${LINE}`}>
      {items.map((r) => (
        <li key={r.placeId} className={`flex flex-col gap-1 py-3 ${LINE}`}>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className={`${display.className} text-xl`}>{r.name}</span>
            {r.category && <span className={`text-sm ${MUTED}`}>{r.category}</span>}
          </div>
          <p className="text-sm">&ldquo;{r.reason}&rdquo;</p>
        </li>
      ))}
    </ul>
  );
}

function EmptyNote() {
  return <p className={`text-sm ${MUTED}`}>{EMPTY_EGG_MESSAGE}</p>;
}

/** 이번 주 무료 추천을 아직 안 받았을 때 맨 위 영역: 메추리 + 시간대 문구 + 추천 받기 */
function StartScreen({
  meal,
  empty,
  busy,
  loading,
  onStart,
}: {
  meal: Meal;
  empty: boolean;
  busy: boolean;
  loading: boolean;
  onStart: () => void;
}) {
  return (
    <section className="flex flex-col items-center gap-5 pt-2 text-center">
      <Image
        src="/brand/mechuri-mascot.svg"
        alt="과잠을 입은 메추리"
        width={160}
        height={160}
        loading="eager"
        unoptimized
      />
      <h1 className={`${display.className} text-3xl leading-snug break-keep`}>
        메추리가 낳은 알에 오늘의 {meal} 메뉴가 들어 있어요
      </h1>
      <p className={`text-sm ${MUTED}`}>일주일에 한 번, 내 취향에 맞는 곳을 무료로 골라 드려요.</p>
      {/* recommend()가 0곳을 돌려준 경우. 저장되지 않았으니 다시 시도할 수 있다 (§5-6) */}
      {empty && <EmptyNote />}
      <button type="button" className={PRIMARY} disabled={busy} onClick={onStart}>
        {loading ? layingMessage(meal) : '이번 주 추천 받기'}
      </button>
    </section>
  );
}

/** 포인트 잔액 — 노른자 배지 */
function PointBadge({ balance }: { balance: number }) {
  return (
    <span
      className={`${display.className} shrink-0 rounded-full bg-[#FFB547] px-3 py-1 text-base leading-none text-[#2A211B]`}
    >
      잔액 {balance} P
    </span>
  );
}

type MapItem = { placeId: number; reason: string; kind: RecKind };
type MapData = {
  recommended: { place: Place; reason: string; kind: RecKind; pickCount: number }[];
  myPlaces: Place[];
};

/** 추천 결과 위 지도 (plan.md §1 화면 3). 실패해도 지도만 빠지고 추천 화면은 그대로 */
function MapSection({ items, myPlaceIds }: { items: MapItem[]; myPlaceIds: number[] }) {
  // 다시 불러오는 동안에는 직전 지도를 그대로 둔다
  const [data, setData] = useState<MapData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([getPlaces([...items.map((i) => i.placeId), ...myPlaceIds]), getAllCurrentLists()])
      .then(([places, lists]) => {
        // §5-2 n_p = 그 가게를 현재 리스트에 넣은 사용자 수
        const pickCount = new Map<number, number>();
        for (const list of lists.values()) {
          for (const placeId of new Set(list.map((i) => i.placeId))) {
            pickCount.set(placeId, (pickCount.get(placeId) ?? 0) + 1);
          }
        }
        const recommended = items.flatMap((i) => {
          const place = places.get(i.placeId);
          return place
            ? [{ place, reason: i.reason, kind: i.kind, pickCount: pickCount.get(i.placeId) ?? 0 }]
            : [];
        });
        const myPlaces = myPlaceIds.flatMap((id) => places.get(id) ?? []);
        if (active) {
          setData({ recommended, myPlaces });
          setFailed(false);
        }
      })
      .catch((e: unknown) => {
        console.error('[recommend map]', e);
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [items, myPlaceIds]);

  if (failed && !data) return null;
  if (!data) {
    return <div className="h-[260px] rounded-xl bg-[#F5F4F2] dark:bg-white/10" aria-hidden />;
  }
  return <RecommendMap recommended={data.recommended} myPlaces={data.myPlaces} />;
}

export default function RecommendPage() {
  const { user, loading } = useUser();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  // 요청 중인 추천 종류. 하나라도 요청 중이면 추천 버튼을 모두 막는다 (§5-6 연타 방지)
  const [pending, setPending] = useState<RecKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 알 깨기 연출. 응답이 온 뒤에도 연출이 끝날 때까지 버튼을 막는다
  const [hatch, setHatch] = useState<Hatch | null>(null);
  // 5단계: 금의 화면 y(px)에서 페이지가 위아래로 벌어진다
  const [reveal, setReveal] = useState<{ y: number; ms: number } | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const busy = pending !== null || hatch !== null;

  // clip-path inset: 금 위치의 가는 틈 → 화면 전체
  useLayoutEffect(() => {
    const el = pageRef.current;
    if (!reveal || !el) return;
    const h = el.clientHeight;
    const y = Math.min(Math.max(reveal.y, 0), h);
    const anim = el.animate(
      [
        { clipPath: `inset(${Math.max(y - 1, 0)}px 0px ${Math.max(h - y - 1, 0)}px 0px)` },
        { clipPath: 'inset(0px 0px 0px 0px)' },
      ],
      { duration: reveal.ms, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', fill: 'both' }
    );
    return () => anim.cancel();
  }, [reveal]);

  // 지도에 올릴 추천 가게: free → point → premium 순, 같은 가게는 처음 것만.
  // 결과 state가 바뀔 때만 새 배열을 만들어 지도가 버튼 상태 변화로 다시 그려지지 않게 한다
  const result = loaded?.result ?? null;
  const pointResult = loaded?.pointResult ?? null;
  const premiumResult = loaded?.premiumResult ?? null;
  const mapItems = useMemo(() => {
    const items: MapItem[] = [];
    const seen = new Set<number>();
    const groups: [RecKind, Shown[] | null][] = [
      ['free', result],
      ['point', pointResult],
      ['premium', premiumResult],
    ];
    for (const [kind, shown] of groups) {
      for (const r of shown ?? []) {
        if (seen.has(r.placeId)) continue;
        seen.add(r.placeId);
        items.push({ placeId: r.placeId, reason: r.reason, kind });
      }
    }
    return items;
  }, [result, pointResult, premiumResult]);

  // 진입 시에는 이번 주 free 결과·잔액·프리미엄 여부를 읽기만 한다. recommend()는 버튼을 눌렀을 때만 (§5-6)
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    let active = true;
    Promise.all([
      getCurrentList(userId),
      getThisWeekFree(userId),
      getPointBalance(userId),
      hasPremium(userId),
    ])
      .then(async ([list, week, balance, premium]) => {
        const result = week ? await toShown(week) : null;
        if (active) {
          setLoaded({
            userId,
            listCount: list.length,
            myPlaceIds: list.map((i) => i.placeId),
            result,
            balance,
            premium,
            pointResult: null,
            premiumResult: null,
            premiumExclude: [],
          });
        }
      })
      .catch(() => {
        if (active) setError('추천 정보를 불러오지 못했어요. 새로고침해 주세요.');
      });
    return () => {
      active = false;
    };
  }, [userId]);

  /** 같은 사용자의 화면일 때만 상태를 고친다 (요청 중 계정이 바뀐 경우 무시) */
  function patch(uid: string, next: Partial<Loaded>) {
    setLoaded((prev) => (prev && prev.userId === uid ? { ...prev, ...next } : prev));
  }

  /** 버튼을 누르면 recommend()와 동시에 연출을 띄운다. 무료 = 긴 버전, 3P·프리미엄 = 짧은 버전 */
  function startHatch(kind: RecKind) {
    setReveal(null);
    if (wantsMotion()) setHatch({ kind, outcome: 'pending' });
  }

  /** 응답이 오면 결과는 바로 페이지에 반영하고(연출 층 아래라 안 보임), 연출에는 1곳 이상인지만 알린다 */
  function settleHatch(kind: RecKind, count: number) {
    setHatch((h) => (h && h.kind === kind ? { ...h, outcome: count > 0 ? 'found' : 'empty' } : h));
  }

  /** 에러: 연출을 바로 멈춘다 */
  function stopHatch() {
    setHatch(null);
    setReveal(null);
  }

  /** 연출 끝: 연출 층을 없애고 페이지를 일반 흐름으로 돌려 맨 위부터 보이게 한다 */
  function finishHatch() {
    const revealed = reveal !== null;
    setHatch(null);
    setReveal(null);
    if (revealed) window.scrollTo(0, 0);
  }

  async function getFree() {
    if (!user || busy) return;
    const uid = user.id;
    setError(null);
    setPending('free');
    startHatch('free');
    try {
      const result = await fetchShown(uid, 'free');
      patch(uid, { result });
      settleHatch('free', result.length);
    } catch (e) {
      stopHatch();
      setError(errorMessage(e));
    } finally {
      setPending(null);
    }
  }

  async function getPoint() {
    if (!user || !loaded || busy || loaded.balance < POINT_COST) return;
    const uid = user.id;
    setError(null);
    setPending('point');
    startHatch('point');
    try {
      const pointResult = await fetchShown(uid, 'point');
      patch(uid, { pointResult });
      settleHatch('point', pointResult.length);
    } catch (e) {
      stopHatch();
      setError(errorMessage(e));
    } finally {
      // 차감 여부는 recommend()가 정한다. 성공·실패와 관계없이 잔액을 다시 읽는다
      try {
        patch(uid, { balance: await getPointBalance(uid) });
      } catch {
        // 잔액 재조회 실패는 기존 값을 유지한다
      }
      setPending(null);
    }
  }

  async function getPremium() {
    if (!user || !loaded || busy || !loaded.premium) return;
    const uid = user.id;
    setError(null);
    setPending('premium');
    startHatch('premium');
    try {
      const premiumResult = await fetchShown(uid, 'premium', loaded.premiumExclude);
      // 0곳이면 직전 5곳을 그대로 들고 있어 다시 눌러도 같은 가게가 나오지 않게 한다
      patch(
        uid,
        premiumResult.length > 0
          ? { premiumResult, premiumExclude: premiumResult.map((r) => r.placeId) }
          : { premiumResult }
      );
      settleHatch('premium', premiumResult.length);
    } catch (e) {
      stopHatch();
      setError(errorMessage(e));
    } finally {
      setPending(null);
    }
  }

  if (loading) return null;

  if (!user) {
    return (
      <div
        className={`flex flex-col items-center gap-6 pt-16 text-center ${INK}`}
        style={{ fontFamily: SYSTEM_FONT }}
      >
        <h1 className={`${display.className} text-3xl`}>로그인이 필요해요</h1>
        <p className={`text-sm ${MUTED}`}>로그인하면 내 취향에 맞는 가게를 추천해 드려요.</p>
        <Link href="/login" className={PRIMARY}>
          로그인하기
        </Link>
      </div>
    );
  }

  if (!loaded || loaded.userId !== user.id) {
    return (
      <p
        className={`pt-16 text-center text-sm ${error ? 'text-[#D2301E]' : MUTED}`}
        style={{ fontFamily: SYSTEM_FONT }}
      >
        {error ?? '불러오는 중…'}
      </p>
    );
  }

  if (loaded.listCount < MIN_LIST) {
    return (
      <div
        className={`flex flex-col items-center gap-6 pt-16 text-center ${INK}`}
        style={{ fontFamily: SYSTEM_FONT }}
      >
        <p className="text-4xl" aria-hidden>
          🔒
        </p>
        <h1 className={`${display.className} text-3xl leading-snug`}>
          추천은 내 맛집 Top 3를
          <br />
          입력하면 열려요
        </h1>
        <p className={`text-sm ${MUTED}`}>
          좋아하는 가게 {MIN_LIST}곳을 알려주시면 취향에 맞는 곳을 골라 드려요.
        </p>
        <Link href="/onboarding" className={PRIMARY}>
          내 맛집 Top 3 입력하기
        </Link>
      </div>
    );
  }

  const { balance, premium, myPlaceIds } = loaded;
  const meal = mealNow();
  const hatchView = hatch && (
    <EggHatch
      variant={hatch.kind === 'free' ? 'full' : 'short'}
      meal={meal}
      outcome={hatch.outcome}
      onOpen={(y, ms) => setReveal({ y, ms })}
      onFinish={finishHatch}
    />
  );

  // 추천 결과(free·point·premium)가 1곳 이상이면 지도
  const mapView = mapItems.length > 0 && (
    <MapSection key="map" items={mapItems} myPlaceIds={myPlaceIds} />
  );
  // 맨 위 영역: 이번 주 무료 추천을 아직 안 받았으면 시작 화면 → 지도, 받았으면 지도 → 무료 추천 카드.
  // key로 순서만 바꿔 지도가 다시 마운트되지 않게 한다
  const top =
    result === null || result.length === 0
      ? [
          <StartScreen
            key="start"
            meal={meal}
            empty={result !== null}
            busy={busy}
            loading={pending === 'free'}
            onStart={getFree}
          />,
          mapView,
        ]
      : [
          mapView,
          <section key="free" className="flex flex-col gap-3">
            <h1 className={`${display.className} text-3xl`}>이번 주 추천</h1>
            <FreeCard items={result} daysLeft={daysUntilNextFree()} />
          </section>,
        ];

  // 3P·프리미엄은 무료 추천 여부와 관계없이 항상 보인다
  const body = (
    <div className="flex flex-col gap-6">
      {top}

      {/* §5-5 포인트 추천: 잔액 ≥ 3일 때만, 요청 중 비활성 */}
      <section className={`flex flex-col gap-3 border-t pt-5 ${LINE}`}>
        <div className="flex items-center justify-between gap-3">
          <h2 className={`${display.className} text-xl`}>포인트로 한 곳 더</h2>
          <PointBadge balance={balance} />
        </div>
        {pointResult !== null &&
          (pointResult.length > 0 ? <PlaceList items={pointResult} /> : <EmptyNote />)}
        <button
          type="button"
          className={SECONDARY}
          disabled={busy || balance < POINT_COST}
          onClick={getPoint}
        >
          {pending === 'point' ? layingMessage(meal) : `${POINT_COST}P로 한 번 더`}
        </button>
      </section>

      {/* §5-7 프리미엄: 미가입이면 결제 화면으로, 가입이면 5곳 무제한 */}
      <section className={`flex flex-col gap-3 border-t pt-5 ${LINE}`}>
        <h2 className={`${display.className} text-xl`}>프리미엄 5곳</h2>
        {premium ? (
          <>
            {premiumResult !== null &&
              (premiumResult.length > 0 ? <PlaceList items={premiumResult} /> : <EmptyNote />)}
            <button type="button" className={SECONDARY} disabled={busy} onClick={getPremium}>
              {pending === 'premium'
                ? layingMessage(meal)
                : premiumResult === null
                  ? '추천 5곳 받기'
                  : '다시 추천'}
            </button>
          </>
        ) : (
          <>
            <p className={`text-sm ${MUTED}`}>횟수 제한 없이 한 번에 5곳씩 추천받을 수 있어요.</p>
            <Link href="/premium" className={SECONDARY}>
              프리미엄 알아보기
            </Link>
          </>
        )}
      </section>

      {error && <p className="text-sm text-[#D2301E]">{error}</p>}
    </div>
  );

  // 감싸는 div 구조는 항상 같게 둔다 (연출 전후로 지도가 다시 마운트되지 않게)
  return (
    <>
      <div ref={pageRef} style={reveal ? REVEAL_STYLE : undefined}>
        <div
          className={`${reveal ? REVEAL_INNER : ''} ${INK}`}
          style={{ fontFamily: SYSTEM_FONT }}
        >
          {body}
        </div>
      </div>
      {hatchView}
    </>
  );
}
