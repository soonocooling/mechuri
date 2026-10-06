'use client';
// 담당 C — plan.md §10 순위 탭 (화면 2), §5-2 순위, §5-3 태그, §5-4 필터
// 비로그인도 볼 수 있다 (RLS: 리스트·리뷰·가게·태그는 누구나 읽기)
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Category } from '@/lib/types';
import { useUser } from '@/lib/auth';
import { getAllCurrentLists } from '@/lib/lists';
import { getPlaces } from '@/lib/places';
import { getTags } from '@/lib/tags';
import { getCurrentReviews } from '@/lib/reviews';
import { computeScores, matchesFilter, rankPlaces, rankTier, type RankedPlace } from '@/lib/ranking';
import { computeTagStats } from '@/lib/tagStats';
import FilterSheet, { dropMismatchedCuisine } from '@/components/FilterSheet';
import PlaceDetail, { type RankingView } from '@/components/PlaceDetail';
import KakaoMap, { type MapItem } from '@/components/KakaoMap';

const CATEGORIES: (Category | '전체')[] = [
  '전체', '한식', '중식', '일식', '양식', '아시안', '분식', '치킨',
  '버거·피자', '샐러드·건강식', '카페·디저트', '술집', '기타',
];
const CARD_TAGS = 3;

type Loaded = RankingView & { listOwners: Set<string> };

async function load(): Promise<Loaded> {
  const [lists, places, tags, reviews] = await Promise.all([
    getAllCurrentLists(),
    getPlaces(),
    getTags(),
    getCurrentReviews(),
  ]);
  const ranked = rankPlaces(computeScores(lists), places);
  const stats = computeTagStats(reviews, tags);
  return { places, ranked, stats, reviews, tags, listOwners: new Set(lists.keys()) };
}

export default function RankingPage() {
  const { user, loading: userLoading } = useUser();
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<Category | '전체'>('전체');
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [mode, setMode] = useState<'list' | 'map'>('list');
  const [openId, setOpenId] = useState<number | null>(null);

  const reload = useCallback(() => {
    load().then(
      (d) => {
        setData(d);
        setError(null);
      },
      (e: unknown) => setError(e instanceof Error ? e.message : '순위를 불러오지 못했어요.')
    );
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const pass = useCallback(
    (r: RankedPlace) =>
      !!data && matchesFilter(r.place, data.stats.get(r.place.id), category, selectedTagIds, data.tags),
    [data, category, selectedTagIds]
  );
  const shown = useMemo(() => (data ? data.ranked.filter(pass) : []), [data, pass]);
  const filtered = category !== '전체' || selectedTagIds.length > 0;

  // 핀: 필터를 통과한 가게 전부. 숫자·색은 필터와 상관없이 전체 순위 기준
  const total = data?.ranked.length ?? 0;
  const mapItems: MapItem[] = useMemo(
    () =>
      shown.map((r) => ({
        placeId: r.place.id,
        name: r.place.name,
        lat: r.place.lat,
        lng: r.place.lng,
        label: String(r.rank),
        tier: rankTier(r.rank, total),
      })),
    [shown, total]
  );
  const openDetail = useCallback((id: number) => setOpenId(id), []);

  function pickCategory(c: Category | '전체') {
    setCategory(c);
    if (data) setSelectedTagIds((prev) => dropMismatchedCuisine(prev, c, data.tags));
  }

  // plan.md §7: Top 3 미입력자 → 순위 탭 상단 배너
  const needsTop3 = !userLoading && !!user && !!data && !data.listOwners.has(user.id);
  const tagLabel = (id: number) => data?.tags.find((t) => t.id === id)?.label;

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-xl font-semibold">국캠 맛집 순위</h1>

      {!userLoading && !user && (
        <Link href="/login" className="rounded-lg bg-gray-100 px-3 py-2 text-sm">
          로그인하고 내 맛집 Top 3를 알려주면 맞춤 추천을 받을 수 있어요 →
        </Link>
      )}
      {needsTop3 && (
        <Link href="/onboarding" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          아직 내 맛집 Top 3가 없어요. 3곳만 입력하면 추천이 열려요 →
        </Link>
      )}

      {/* 대분류 칩 */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={category === c}
            className={`shrink-0 rounded-full border px-3 py-1 text-sm ${
              category === c ? 'border-black bg-black text-white' : 'border-gray-300'
            }`}
            onClick={() => pickCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          onClick={() => setFilterOpen(true)}
          disabled={!data}
        >
          필터 ⚙{selectedTagIds.length > 0 && <b className="ml-1">{selectedTagIds.length}</b>}
        </button>
        <div className="flex overflow-hidden rounded-lg border border-gray-300 text-sm">
          {(['list', 'map'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              className={`px-3 py-1.5 ${mode === m ? 'bg-black text-white' : ''}`}
              onClick={() => setMode(m)}
            >
              {m === 'list' ? '목록' : '지도'}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600">
          {error}{' '}
          <button type="button" className="underline" onClick={reload}>
            다시 시도
          </button>
        </p>
      )}
      {!data && !error && <p className="py-8 text-center text-sm text-gray-500">순위 불러오는 중…</p>}

      {data && mode === 'map' && <KakaoMap items={mapItems} onSelect={openDetail} />}

      {data && mode === 'list' && (
        <>
          {shown.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">
              {filtered ? '이 조건에 맞는 가게가 아직 없어요.' : '아직 순위가 없어요. 내 맛집을 입력해 주세요!'}
            </p>
          ) : (
            <ol className="flex flex-col gap-2">
              {shown.map((r) => {
                const tagIds = data.stats.get(r.place.id)?.assignedTagIds ?? [];
                return (
                  <li key={r.place.id}>
                    <button
                      type="button"
                      className="flex w-full items-start gap-3 rounded-lg border border-gray-200 px-3 py-2 text-left"
                      onClick={() => setOpenId(r.place.id)}
                    >
                      {/* 전체 순위 (공동 순위면 같은 숫자) */}
                      <span className="min-w-6 shrink-0 pt-0.5 text-lg font-bold">{r.rank}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{r.place.name}</div>
                        <div className="text-xs text-gray-500">
                          {r.place.category} · {r.n}명
                          {r.nFirst > 0 && ` · 1위 ${r.nFirst}표`}
                        </div>
                        {tagIds.length > 0 && (
                          <div className="mt-1 truncate text-xs text-gray-600">
                            {tagIds.slice(0, CARD_TAGS).map((id) => `#${tagLabel(id)}`).join(' ')}
                          </div>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}

      {filterOpen && data && (
        <FilterSheet
          category={category}
          selectedTagIds={selectedTagIds}
          tags={data.tags}
          onChange={(next) => {
            setCategory(next.category);
            setSelectedTagIds(next.selectedTagIds);
          }}
          onClose={() => setFilterOpen(false)}
        />
      )}

      {openId !== null && data && (
        <PlaceDetail placeId={openId} view={data} onClose={() => setOpenId(null)} onChanged={reload} />
      )}
    </div>
  );
}
