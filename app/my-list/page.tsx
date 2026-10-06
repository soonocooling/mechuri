'use client';
// 담당 A — plan.md §10 내 맛집 편집(저장 = 새 리스트)
import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { KakaoPlace, Place } from '@/lib/types';
import { useUser } from '@/lib/auth';
import { ensurePlace, getPlaces } from '@/lib/places';
import { getCurrentList, saveList } from '@/lib/lists';
import PlaceSearch from '@/components/PlaceSearch';

const MIN = 3;
const MAX = 10;

// 길게 눌러 끌어서 순서 바꾸기
const LONG_PRESS_MS = 250;
const MOVE_TOLERANCE = 8; // 길게 누르기 전에 이만큼 움직이면 스크롤로 보고 취소
const ROW_GAP = 8; // ol의 gap-2
const EDGE = 80; // 화면 위·아래 이 거리 안이면 자동 스크롤
const SCROLL_STEP = 8;

type Drag = { from: number; to: number; dy: number; slot: number };
type Press = {
  index: number;
  count: number;
  startY: number; // 누른 지점의 문서 기준 y
  pointerY: number; // 현재 손가락의 화면 기준 y
  slot: number; // 행 높이 + 간격
  to: number; // 놓으면 들어갈 칸
  timer: ReturnType<typeof setTimeout>;
  frame: number;
  active: boolean;
};

/** from 칸을 to 칸으로 옮기고 사이의 칸을 한 칸씩 민다 */
function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** 끄는 중 i번째 행이 보일 칸 */
function previewIndex(i: number, drag: Drag | null): number {
  if (!drag) return i;
  const { from, to } = drag;
  if (i === from) return to;
  if (from < to && i > from && i <= to) return i - 1;
  if (to < from && i >= to && i < from) return i + 1;
  return i;
}

export default function MyListPage() {
  const router = useRouter();
  const { user, loading } = useUser();
  const [items, setItems] = useState<Place[] | null>(null); // null = 불러오는 중
  const [savedIds, setSavedIds] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const press = useRef<Press | null>(null);

  // 끄는 중에는 화면이 스크롤되지 않게 막는다 (React의 touchmove는 passive라 직접 등록)
  useEffect(() => {
    const block = (e: TouchEvent) => {
      if (press.current?.active) e.preventDefault();
    };
    document.addEventListener('touchmove', block, { passive: false });
    return () => {
      document.removeEventListener('touchmove', block);
      const p = press.current;
      if (p) {
        clearTimeout(p.timer);
        cancelAnimationFrame(p.frame);
      }
    };
  }, []);

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
      return moveItem(prev, i, j);
    });
  }

  function updateDrag(p: Press) {
    const dy = p.pointerY + window.scrollY - p.startY;
    const to = Math.min(p.count - 1, Math.max(0, p.index + Math.round(dy / p.slot)));
    p.to = to;
    setDrag({ from: p.index, to, dy, slot: p.slot });
  }

  // 손가락이 화면 끝에 머물러 있어도 계속 스크롤한다
  function autoScroll() {
    const p = press.current;
    if (!p?.active) return;
    const step =
      p.pointerY < EDGE ? -SCROLL_STEP : p.pointerY > window.innerHeight - EDGE ? SCROLL_STEP : 0;
    if (step) {
      window.scrollBy(0, step);
      updateDrag(p);
    }
    p.frame = requestAnimationFrame(autoScroll);
  }

  function endPress(commit: boolean) {
    const p = press.current;
    if (!p) return;
    clearTimeout(p.timer);
    cancelAnimationFrame(p.frame);
    press.current = null;
    if (p.active && commit && p.to !== p.index) {
      setNotice(null);
      setItems((prev) => prev && moveItem(prev, p.index, p.to));
    }
    setDrag(null);
  }

  function onRowPointerDown(e: ReactPointerEvent<HTMLLIElement>, i: number) {
    if (busy || !items || press.current) return;
    if (e.button !== 0 || (e.target as Element).closest('button')) return;
    const row = e.currentTarget;
    row.setPointerCapture(e.pointerId);
    const p: Press = {
      index: i,
      count: items.length,
      startY: e.clientY + window.scrollY,
      pointerY: e.clientY,
      slot: row.offsetHeight + ROW_GAP,
      to: i,
      timer: setTimeout(() => {
        p.active = true;
        navigator.vibrate?.(10);
        setDrag({ from: i, to: i, dy: 0, slot: p.slot });
        p.frame = requestAnimationFrame(autoScroll);
      }, LONG_PRESS_MS),
      frame: 0,
      active: false,
    };
    press.current = p;
  }

  function onRowPointerMove(e: ReactPointerEvent<HTMLLIElement>) {
    const p = press.current;
    if (!p) return;
    p.pointerY = e.clientY;
    if (p.active) updateDrag(p);
    else if (Math.abs(e.clientY + window.scrollY - p.startY) > MOVE_TOLERANCE) endPress(false);
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
        {items.map((p, i) => {
          const lifted = drag?.from === i;
          const offset = !drag ? 0 : lifted ? drag.dy : (previewIndex(i, drag) - i) * drag.slot;
          return (
            <li
              key={p.id}
              className={`relative flex select-none items-center gap-2 rounded-lg border bg-background px-3 py-2 [-webkit-touch-callout:none] ${
                lifted
                  ? 'z-10 scale-[1.02] border-gray-300 shadow-lg'
                  : `border-gray-200 ${drag ? 'transition-transform duration-200' : ''}`
              }`}
              style={offset ? { transform: `translateY(${offset}px)` } : undefined}
              onPointerDown={(e) => onRowPointerDown(e, i)}
              onPointerMove={onRowPointerMove}
              onPointerUp={() => endPress(true)}
              onPointerCancel={() => endPress(false)}
              onContextMenu={(e) => {
                if (press.current) e.preventDefault();
              }}
            >
              <span className="w-5 font-semibold">{previewIndex(i, drag) + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{p.name}</div>
                <div className="text-xs text-gray-500">{p.category}</div>
              </div>
              {/* 손잡이: 꾹 눌러 끌 수 있다는 표시. 키보드는 포커스 후 ↑·↓ */}
              <span
                role="button"
                tabIndex={0}
                aria-label={`${p.name} 순서 바꾸기. 꾹 눌러 끌거나 위·아래 화살표 키`}
                title="꾹 눌러 끌어서 순서 바꾸기"
                className={`rounded p-1 text-gray-400 ${lifted ? 'cursor-grabbing text-gray-600' : 'cursor-grab'}`}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    move(i, e.key === 'ArrowUp' ? -1 : 1);
                  }
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <circle cx="5.5" cy="3.5" r="1.5" />
                  <circle cx="10.5" cy="3.5" r="1.5" />
                  <circle cx="5.5" cy="8" r="1.5" />
                  <circle cx="10.5" cy="8" r="1.5" />
                  <circle cx="5.5" cy="12.5" r="1.5" />
                  <circle cx="10.5" cy="12.5" r="1.5" />
                </svg>
              </span>
              <button type="button" aria-label="빼기" className="px-1 text-gray-400" onClick={() => remove(p.id)}>
                ✕
              </button>
            </li>
          );
        })}
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
