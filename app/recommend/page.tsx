'use client';
// 담당 B — plan.md §10 추천 탭 (화면 3), §5-5, §5-6, §5-7, §7
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Category, RecItem, RecKind } from '@/lib/types';
import { useUser } from '@/lib/auth';
import { getCurrentList } from '@/lib/lists';
import { getPlaces } from '@/lib/places';
import { getPointBalance } from '@/lib/points';
import { hasPremium } from '@/lib/premium';
import { daysUntilNextFree, getThisWeekFree, recommend } from '@/lib/recommend';

/** §7 Top 3 미입력자는 추천 탭 잠금 */
const MIN_LIST = 3;

/** §5-5 포인트 추천 1회 비용 */
const POINT_COST = 3;

type Shown = { placeId: number; name: string; category: Category | null; reason: string };

/**
 * result = null이면 이번 주 free 기록 없음.
 * pointResult·premiumResult = null이면 아직 요청 안 함.
 * premiumExclude = 직전 프리미엄 5곳의 placeId. 페이지 상태라 새로고침하면 초기화 (§5-6)
 */
type Loaded = {
  userId: string;
  listCount: number;
  result: Shown[] | null;
  balance: number;
  premium: boolean;
  pointResult: Shown[] | null;
  premiumResult: Shown[] | null;
  premiumExclude: number[];
};

const BUTTON = 'flex min-h-12 w-full items-center justify-center rounded-lg px-4 py-3 font-medium';

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

function PlaceList({ items }: { items: Shown[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {items.map((r) => (
        <li
          key={r.placeId}
          className="flex flex-col gap-1 rounded-lg border border-gray-200 p-4 dark:border-white/15"
        >
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-semibold">{r.name}</span>
            {r.category && <span className="text-sm text-gray-500">{r.category}</span>}
          </div>
          <p className="text-sm">&ldquo;{r.reason}&rdquo;</p>
        </li>
      ))}
    </ul>
  );
}

function EmptyNote() {
  return (
    <p className="rounded-lg bg-gray-100 p-4 text-sm text-gray-600 dark:bg-white/10 dark:text-gray-300">
      아직 추천할 만한 가게가 없어요. 다른 사람들이 맛집을 더 입력하면 다시 시도해 주세요.
    </p>
  );
}

export default function RecommendPage() {
  const { user, loading } = useUser();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  // 요청 중인 추천 종류. 하나라도 요청 중이면 추천 버튼을 모두 막는다 (§5-6 연타 방지)
  const [pending, setPending] = useState<RecKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = pending !== null;

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

  async function getFree() {
    if (!user || busy) return;
    setError(null);
    setPending('free');
    try {
      const result = await toShown(await recommend(user.id, 'free'));
      setLoaded((prev) => (prev ? { ...prev, result } : prev));
    } catch {
      setError('추천을 받지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setPending(null);
    }
  }

  async function getPoint() {
    if (!user || !loaded || busy || loaded.balance < POINT_COST) return;
    const uid = user.id;
    setError(null);
    setPending('point');
    try {
      const pointResult = await toShown(await recommend(uid, 'point'));
      patch(uid, { pointResult });
    } catch (e) {
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
    try {
      const premiumResult = await toShown(await recommend(uid, 'premium', loaded.premiumExclude));
      // 0곳이면 직전 5곳을 그대로 들고 있어 다시 눌러도 같은 가게가 나오지 않게 한다
      patch(
        uid,
        premiumResult.length > 0
          ? { premiumResult, premiumExclude: premiumResult.map((r) => r.placeId) }
          : { premiumResult }
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(null);
    }
  }

  if (loading) return null;

  if (!user) {
    return (
      <div className="flex flex-col items-center gap-6 pt-16 text-center">
        <h1 className="text-xl font-semibold">로그인이 필요해요</h1>
        <p className="text-sm text-gray-500">로그인하면 내 취향에 맞는 가게를 추천해 드려요.</p>
        <Link href="/login" className={`${BUTTON} bg-black text-white`}>
          로그인하기
        </Link>
      </div>
    );
  }

  if (!loaded || loaded.userId !== user.id) {
    return error ? (
      <p className="pt-16 text-center text-sm text-red-600">{error}</p>
    ) : (
      <p className="pt-16 text-center text-sm text-gray-500">불러오는 중…</p>
    );
  }

  if (loaded.listCount < MIN_LIST) {
    return (
      <div className="flex flex-col items-center gap-6 pt-16 text-center">
        <p className="text-4xl" aria-hidden>
          🔒
        </p>
        <h1 className="text-xl font-semibold">추천은 내 맛집 Top 3를 입력하면 열려요</h1>
        <p className="text-sm text-gray-500">
          좋아하는 가게 {MIN_LIST}곳을 알려주시면 취향에 맞는 곳을 골라 드려요.
        </p>
        <Link href="/onboarding" className={`${BUTTON} bg-black text-white`}>
          내 맛집 Top 3 입력하기
        </Link>
      </div>
    );
  }

  const { result, balance, premium, pointResult, premiumResult } = loaded;
  const hasResult = result !== null && result.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">이번 주 추천 (무료 1곳)</h1>

      {hasResult ? (
        <>
          <PlaceList items={result} />
          <p className="text-sm text-gray-500">다음 무료 추천까지 {daysUntilNextFree()}일</p>
        </>
      ) : (
        <>
          {/* recommend()가 0곳을 돌려준 경우. 저장되지 않았으니 다시 시도할 수 있다 (§5-6) */}
          {result !== null && <EmptyNote />}
          <button
            type="button"
            className={`${BUTTON} bg-black text-white disabled:opacity-50`}
            disabled={busy}
            onClick={getFree}
          >
            {pending === 'free' ? '고르는 중…' : '이번 주 추천 받기'}
          </button>
        </>
      )}

      {/* §5-5 포인트 추천: 잔액 ≥ 3일 때만, 요청 중 비활성 */}
      <section className="flex flex-col gap-3 border-t border-gray-200 pt-4 dark:border-white/15">
        {pointResult !== null &&
          (pointResult.length > 0 ? <PlaceList items={pointResult} /> : <EmptyNote />)}
        <div className="flex items-center gap-3">
          <button
            type="button"
            className={`${BUTTON} flex-1 border border-black disabled:opacity-40 dark:border-white`}
            disabled={busy || balance < POINT_COST}
            onClick={getPoint}
          >
            {pending === 'point' ? '고르는 중…' : `${POINT_COST}P로 한 번 더`}
          </button>
          <span className="shrink-0 text-sm text-gray-500">잔액 {balance}P</span>
        </div>
      </section>

      {/* §5-7 프리미엄: 미가입이면 결제 화면으로, 가입이면 5곳 무제한 */}
      <section className="flex flex-col gap-3 border-t border-gray-200 pt-4 dark:border-white/15">
        {premium ? (
          <>
            {premiumResult !== null &&
              (premiumResult.length > 0 ? <PlaceList items={premiumResult} /> : <EmptyNote />)}
            <button
              type="button"
              className={`${BUTTON} bg-black text-white disabled:opacity-50`}
              disabled={busy}
              onClick={getPremium}
            >
              {pending === 'premium'
                ? '고르는 중…'
                : premiumResult === null
                  ? '추천 5곳 받기'
                  : '다시 추천'}
            </button>
          </>
        ) : (
          <Link href="/premium" className={`${BUTTON} bg-black text-white`}>
            프리미엄: 무제한 5곳
          </Link>
        )}
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
