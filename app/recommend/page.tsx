'use client';
// 담당 B — plan.md §10 추천 탭 (화면 3), §5-6, §7
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Category, RecItem } from '@/lib/types';
import { useUser } from '@/lib/auth';
import { getCurrentList } from '@/lib/lists';
import { getPlaces } from '@/lib/places';
import { daysUntilNextFree, getThisWeekFree, recommend } from '@/lib/recommend';

/** §7 Top 3 미입력자는 추천 탭 잠금 */
const MIN_LIST = 3;

type Shown = { placeId: number; name: string; category: Category | null; reason: string };

/** result = null이면 이번 주 free 기록 없음 */
type Loaded = { userId: string; listCount: number; result: Shown[] | null };

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

export default function RecommendPage() {
  const { user, loading } = useUser();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 진입 시에는 이번 주 free 결과를 읽기만 한다. recommend()는 버튼을 눌렀을 때만 (§5-6)
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    let active = true;
    Promise.all([getCurrentList(userId), getThisWeekFree(userId)])
      .then(async ([list, week]) => {
        const result = week ? await toShown(week) : null;
        if (active) setLoaded({ userId, listCount: list.length, result });
      })
      .catch(() => {
        if (active) setError('추천 정보를 불러오지 못했어요. 새로고침해 주세요.');
      });
    return () => {
      active = false;
    };
  }, [userId]);

  async function getFree() {
    if (!user || busy) return;
    setError(null);
    setBusy(true);
    try {
      const result = await toShown(await recommend(user.id, 'free'));
      setLoaded((prev) => (prev ? { ...prev, result } : prev));
    } catch {
      setError('추천을 받지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setBusy(false);
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

  const { result } = loaded;
  const hasResult = result !== null && result.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">이번 주 추천 (무료 1곳)</h1>

      {hasResult ? (
        <>
          <ul className="flex flex-col gap-3">
            {result.map((r) => (
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
          <p className="text-sm text-gray-500">다음 무료 추천까지 {daysUntilNextFree()}일</p>
        </>
      ) : (
        <>
          {result !== null && (
            // recommend()가 0곳을 돌려준 경우. 저장되지 않았으니 다시 시도할 수 있다 (§5-6)
            <p className="rounded-lg bg-gray-100 p-4 text-sm text-gray-600 dark:bg-white/10 dark:text-gray-300">
              아직 추천할 만한 가게가 없어요. 다른 사람들이 맛집을 더 입력하면 다시 시도해 주세요.
            </p>
          )}
          <button
            type="button"
            className={`${BUTTON} bg-black text-white disabled:opacity-50`}
            disabled={busy}
            onClick={getFree}
          >
            {busy ? '고르는 중…' : '이번 주 추천 받기'}
          </button>
        </>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
