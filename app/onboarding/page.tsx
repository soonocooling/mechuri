'use client';
// 담당 A — plan.md §10 Top 3 선택 → ReviewSheet(embedded) × 3 → 완료
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { KakaoPlace, Place } from '@/lib/types';
import { useUser } from '@/lib/auth';
import { ensurePlace } from '@/lib/places';
import { getCurrentList, saveList } from '@/lib/lists';
import PlaceSearch from '@/components/PlaceSearch';
import ReviewSheet from '@/components/ReviewSheet';

const TOP_N = 3;

type Step = 'pick' | 'review' | 'done';

export default function OnboardingPage() {
  const router = useRouter();
  const { user, loading } = useUser();
  const [step, setStep] = useState<Step>('pick');
  const [picked, setPicked] = useState<Place[]>([]);
  const [earned, setEarned] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 비로그인 → 로그인, 이미 리스트가 있으면 → 내 맛집 편집
  const userId = user?.id;
  useEffect(() => {
    if (loading) return;
    if (!userId) {
      router.replace('/login');
      return;
    }
    getCurrentList(userId).then(
      (items) => {
        if (items.length > 0) router.replace('/my-list');
      },
      () => {}
    );
    // 로그인 상태가 정해질 때 한 번만 확인 (저장 후에는 다시 보내지 않는다)
  }, [loading, userId, router]);

  async function add(k: KakaoPlace) {
    if (picked.length >= TOP_N || busy) return;
    setError(null);
    setBusy(true);
    try {
      const place = await ensurePlace(k);
      setPicked((prev) =>
        prev.some((p) => p.id === place.id) || prev.length >= TOP_N ? prev : [...prev, place]
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '가게를 추가하지 못했어요.');
    } finally {
      setBusy(false);
    }
  }

  function move(i: number, d: -1 | 1) {
    setPicked((prev) => {
      const j = i + d;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function next() {
    setError(null);
    setBusy(true);
    try {
      await saveList(
        picked.map((p) => p.id),
        true
      );
      setStep('review');
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했어요.');
    } finally {
      setBusy(false);
    }
  }

  function reviewDone(p: number) {
    const all = [...earned, p];
    setEarned(all);
    if (all.length >= picked.length) setStep('done');
  }

  if (loading || !user) return null;

  if (step === 'review') {
    const i = earned.length;
    const place = picked[i];
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">
          {place.name} 어땠어? ({i + 1}/{picked.length})
        </h1>
        <ReviewSheet
          key={place.id}
          placeId={place.id}
          placeCategory={place.category}
          source="onboarding"
          embedded
          onDone={reviewDone}
        />
        {/* TODO: B의 ReviewSheet에 건너뛰기가 생기면 지운다 (WORK_SPLIT §6 A4) */}
        <button
          type="button"
          className="self-start text-sm text-gray-500 underline"
          onClick={() => reviewDone(0)}
        >
          건너뛰기
        </button>
      </div>
    );
  }

  if (step === 'done') {
    // 세 곳 모두 earned > 0 이면 완주 보너스 +3 (plan.md §5-5)
    const sum = earned.reduce((a, b) => a + b, 0);
    const total = sum + (earned.length === TOP_N && earned.every((e) => e > 0) ? 3 : 0);
    return (
      <div className="flex flex-col items-center gap-6 pt-16 text-center">
        <h1 className="text-2xl font-bold">완료! +{total}P 획득</h1>
        <div className="flex w-full gap-2">
          <button
            type="button"
            className="flex-1 rounded-lg bg-black py-3 font-medium text-white"
            onClick={() => router.push('/recommend')}
          >
            첫 추천 받기
          </button>
          <button
            type="button"
            className="flex-1 rounded-lg border border-gray-300 py-3 font-medium"
            onClick={() => router.push('/my-list')}
          >
            더 추가
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">내 맛집 Top {TOP_N}</h1>
      <p className="text-sm text-gray-500">국캠 근처에서 제일 좋아하는 가게 {TOP_N}곳을 골라 순서대로 놓아주세요.</p>

      {picked.length < TOP_N && <PlaceSearch onSelect={add} />}
      {busy && <p className="text-sm text-gray-500">저장 중…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <ol className="flex flex-col gap-2">
        {picked.map((p, i) => (
          <li key={p.id} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
            <span className="w-5 font-semibold">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{p.name}</div>
              <div className="text-xs text-gray-500">{p.category}</div>
            </div>
            <button type="button" aria-label="위로" className="px-1 disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)}>
              ▲
            </button>
            <button type="button" aria-label="아래로" className="px-1 disabled:opacity-30" disabled={i === picked.length - 1} onClick={() => move(i, 1)}>
              ▼
            </button>
            <button
              type="button"
              aria-label="빼기"
              className="px-1 text-gray-400"
              onClick={() => setPicked((prev) => prev.filter((x) => x.id !== p.id))}
            >
              ✕
            </button>
          </li>
        ))}
      </ol>

      <button
        type="button"
        className="rounded-lg bg-black py-3 font-medium text-white disabled:opacity-40"
        disabled={picked.length !== TOP_N || busy}
        onClick={next}
      >
        다음
      </button>
    </div>
  );
}
