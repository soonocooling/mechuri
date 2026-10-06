'use client';
// 담당 B — plan.md §10 꾹 눌러 끌어서 순서 바꾸기 (내 맛집, 온보딩 Top 3)
import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

const LONG_PRESS_MS = 250;
const MOVE_TOLERANCE = 8; // 길게 누르기 전에 이만큼 움직이면 스크롤로 보고 취소
const EDGE = 80; // 화면 위·아래 이 거리 안이면 자동 스크롤
const SCROLL_STEP = 8;

export type Drag = { from: number; to: number; dy: number; slot: number };
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
export function moveItem<T>(list: T[], from: number, to: number): T[] {
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

type Options = {
  count: number; // 행 개수
  onMove: (from: number, to: number) => void; // 놓았을 때 자리가 바뀌었으면 호출
  disabled?: boolean;
  gap?: number; // 행 사이 간격(px). ol의 gap-2 = 8
};

/**
 * 행을 0.25초 꾹 누르면 들어 올리고, 끄는 동안 다른 행을 밀어내고, 놓으면 그 자리로 옮긴다.
 * 0.25초 전에 움직이면 평소처럼 스크롤. `<button>` 위에서 누르면 시작하지 않는다.
 */
export function useDragReorder({ count, onMove, disabled = false, gap = 8 }: Options) {
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
    if (p.active && commit && p.to !== p.index) onMove(p.index, p.to);
    setDrag(null);
  }

  function onPointerDown(e: ReactPointerEvent<HTMLElement>, i: number) {
    if (disabled || press.current) return;
    if (e.button !== 0 || (e.target as Element).closest('button')) return;
    const row = e.currentTarget;
    row.setPointerCapture(e.pointerId);
    const p: Press = {
      index: i,
      count,
      startY: e.clientY + window.scrollY,
      pointerY: e.clientY,
      slot: row.offsetHeight + gap,
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

  function onPointerMove(e: ReactPointerEvent<HTMLElement>) {
    const p = press.current;
    if (!p) return;
    p.pointerY = e.clientY;
    if (p.active) updateDrag(p);
    else if (Math.abs(e.clientY + window.scrollY - p.startY) > MOVE_TOLERANCE) endPress(false);
  }

  return {
    drag,
    /** i번째 행이 들려 있는지 */
    lifted: (i: number) => drag?.from === i,
    /** 끄는 중 i번째 행이 보일 칸(순위 숫자용) */
    shownIndex: (i: number) => previewIndex(i, drag),
    /** i번째 행의 translateY(px). 0이면 제자리 */
    offset: (i: number) =>
      !drag ? 0 : drag.from === i ? drag.dy : (previewIndex(i, drag) - i) * drag.slot,
    /** 행(li)에 펼쳐 넣을 이벤트 */
    rowProps: (i: number) => ({
      onPointerDown: (e: ReactPointerEvent<HTMLElement>) => onPointerDown(e, i),
      onPointerMove,
      onPointerUp: () => endPress(true),
      onPointerCancel: () => endPress(false),
      onContextMenu: (e: { preventDefault: () => void }) => {
        if (press.current) e.preventDefault();
      },
    }),
  };
}
