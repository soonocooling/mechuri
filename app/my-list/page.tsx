'use client';
// 담당 A — plan.md §10 내 맛집 편집(저장 = 새 리스트)
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { KakaoPlace, Place } from '@/lib/types';
import { useUser } from '@/lib/auth';
import { ensurePlace, getPlaces } from '@/lib/places';
import { getCurrentList, saveList } from '@/lib/lists';
import PlaceSearch from '@/components/PlaceSearch';

const MIN = 3;
const MAX = 10;

export default function MyListPage() {
  const router = useRouter();
  const { user, loading } = useUser();
  const [items, setItems] = useState<Place[] | null>(null); // null = 불러오는 중
  const [savedIds, setSavedIds] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const userId = user?.id;
  useEffect(() => {
    if (loading) return;
    if (!userId) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        const list = await getCurrentList(userId);
        const places = await getPlaces(list.map((i) => i.placeId));
        const ordered = list.flatMap((i) => places.get(i.placeId) ?? []);
        setItems(ordered);
        setSavedIds(ordered.map((p) => p.id));
      } catch (e) {
        setError(e instanceof Error ? e.message : '불러오지 못했어요.');
        setItems([]);
      }
    })();
  }, [loading, userId, router]);

  async function add(k: KakaoPlace) {
    if (!items || items.length >= MAX || busy) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const place = await ensurePlace(k);
      setItems((prev) =>
        !prev || prev.some((p) => p.id === place.id) || prev.length >= MAX ? prev : [...prev, place]
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '가게를 추가하지 못했어요.');
    } finally {
      setBusy(false);
    }
  }

  function move(i: number, d: -1 | 1) {
    setNotice(null);
    setItems((prev) => {
      if (!prev) return prev;
      const j = i + d;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function remove(id: number) {
    setNotice(null);
    setItems((prev) => prev && prev.filter((p) => p.id !== id));
  }

  async function save() {
    if (!items) return;
    setError(null);
    setBusy(true);
    try {
      const ids = items.map((p) => p.id);
      await saveList(ids, false);
      setSavedIds(ids);
      setNotice('저장했어요.');
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했어요.');
    } finally {
      setBusy(false);
    }
  }

  if (loading || !user || items === null) return null;

  // 저장된 리스트가 없고 아직 아무것도 고르지 않았으면 온보딩으로 안내
  if (savedIds.length === 0 && items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 pt-16 text-center">
        <h1 className="text-xl font-semibold">아직 내 맛집이 없어요</h1>
        <p className="text-sm text-gray-500">Top 3를 입력하면 추천을 받을 수 있어요.</p>
        <Link href="/onboarding" className="rounded-lg bg-black px-6 py-3 font-medium text-white">
          Top 3 입력하기
        </Link>
      </div>
    );
  }

  const changed = items.map((p) => p.id).join() !== savedIds.join();
  const countOk = items.length >= MIN && items.length <= MAX;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">내 맛집</h1>
        <span className="text-sm text-gray-500">
          {items.length}/{MAX}
        </span>
      </div>

      {items.length < MAX && <PlaceSearch onSelect={add} />}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <ol className="flex flex-col gap-2">
        {items.map((p, i) => (
          <li key={p.id} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
            <span className="w-5 font-semibold">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{p.name}</div>
              <div className="text-xs text-gray-500">{p.category}</div>
            </div>
            <button type="button" aria-label="위로" className="px-1 disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)}>
              ▲
            </button>
            <button type="button" aria-label="아래로" className="px-1 disabled:opacity-30" disabled={i === items.length - 1} onClick={() => move(i, 1)}>
              ▼
            </button>
            <button type="button" aria-label="빼기" className="px-1 text-gray-400" onClick={() => remove(p.id)}>
              ✕
            </button>
          </li>
        ))}
      </ol>

      {!countOk && <p className="text-sm text-red-600">가게는 {MIN}~{MAX}곳이어야 저장할 수 있어요.</p>}
      {notice && <p className="text-sm text-green-700">{notice}</p>}

      <button
        type="button"
        className="rounded-lg bg-black py-3 font-medium text-white disabled:opacity-40"
        disabled={!changed || !countOk || busy}
        onClick={save}
      >
        {busy ? '저장 중…' : '저장'}
      </button>
    </div>
  );
}
