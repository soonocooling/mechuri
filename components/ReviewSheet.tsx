'use client';
// 담당 B — plan.md §10 칩 선택 시트
// 제출은 lib/reviews.ts의 submitReview(= §4-1 submit_review RPC)를 부른다
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Do_Hyeon } from 'next/font/google';
import type { Category, ReviewSource, Tag } from '@/lib/types';
import { getTags, groupTags } from '@/lib/tags';
import { submitReview } from '@/lib/reviews';
import { getReviewContext, previewPoints } from '@/lib/points';

type ReviewSheetProps = {
  placeId: number;
  placeCategory: Category;
  source: ReviewSource;
  embedded?: boolean;              // 온보딩 화면 안에 끼울 때 true
  onDone: (earned: number) => void; // 제출 또는 건너뛰기 후 호출(건너뛰기면 0)
};

// plan.md §13 디자인 규칙 — 제목·숫자는 Do Hyeon, 본문은 시스템 글꼴
const display = Do_Hyeon({ weight: '400', subsets: ['latin'], fallback: ['system-ui', 'sans-serif'] });
const SYSTEM_FONT =
  "system-ui, -apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', sans-serif";

export default function ReviewSheet({
  placeId,
  placeCategory,
  source,
  embedded,
  onDone,
}: ReviewSheetProps) {
  const [tags, setTags] = useState<Tag[] | null>(null);
  // 포인트 조건은 열 때 한 번만 받는다 (§5-5). 받기 전·비로그인은 0P로 보인다
  const [ctx, setCtx] = useState({ isFirst: false, pioneer: false });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // iOS 햅틱용 숨김 스위치 — React 타입에 switch 속성이 없어 ref로 붙인다
  const hapticId = useId();
  const hapticInputRef = useRef<HTMLInputElement>(null);
  const hapticLabelRef = useRef<HTMLLabelElement>(null);
  useEffect(() => {
    hapticInputRef.current?.setAttribute('switch', '');
  }, []);

  // 사용자 탭 핸들러 안에서 동기적으로 불러야 한다 (iOS는 탭 밖에서 무시)
  function hapticTap() {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(10);
      } catch {}
      return;
    }
    // navigator.vibrate가 없는 iOS 18 사파리 — 스위치 체크박스 토글 햅틱
    try {
      hapticLabelRef.current?.click();
    } catch {}
  }

  // 칩 목록(§6 시드 72행)과 포인트 조건(§5-5)을 열 때 한 번만, 같이 읽는다
  useEffect(() => {
    let alive = true;
    Promise.all([getTags(), getReviewContext(placeId)]).then(
      ([all, reviewCtx]) => {
        if (!alive) return;
        setTags(all);
        setCtx(reviewCtx);
      },
      () => {
        if (alive) setLoadError('칩을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
      }
    );
    return () => {
      alive = false;
    };
  }, [placeId]);

  // cuisine은 가게 대분류와 parentLabel이 같은 칩만 (기타면 전부, §6)
  const groups = useMemo(
    () => (tags ? groupTags(tags, placeCategory) : []),
    [tags, placeCategory]
  );

  // 칩을 누를 때마다 동기로 다시 계산한다 (DB 조회 없음, §5-5)
  const earned = useMemo(
    () => (tags ? previewPoints(selected, tags, ctx) : 0),
    [selected, tags, ctx]
  );

  function toggle(tag: Tag, groupTagIds: number[], maxSelect: number) {
    setError(null);
    // 햅틱을 탭 안에서 동기적으로 내야 해서 다음 상태를 여기서 바로 계산한다
    const next = (() => {
      const prev = selected;
      if (prev.includes(tag.id)) return prev.filter((id) => id !== tag.id);
      const inGroup = prev.filter((id) => groupTagIds.includes(id));
      // 평가형·가격대처럼 한 개만 고르는 그룹은 누른 칩으로 바꿔준다
      if (maxSelect === 1) return [...prev.filter((id) => !groupTagIds.includes(id)), tag.id];
      // 서술형은 max_select를 넘으면 더 고를 수 없다 (§4-1 — 이 검사는 앱에서)
      if (inGroup.length >= maxSelect) return prev;
      return [...prev, tag.id];
    })();
    if (next === selected) return; // 선택이 안 바뀌면 햅틱도 없다
    setSelected(next);
    hapticTap();
  }

  async function submit() {
    if (selected.length === 0 || busy) return;
    setError(null);
    setBusy(true);
    try {
      await submitReview(placeId, selected, source);
      // await 뒤라 iOS 스위치 햅틱은 동작하지 않는다 — vibrate 지원 환경만
      try {
        navigator.vibrate?.(30);
      } catch {}
      // 화면에 보여준 값(제출 직전 previewPoints)을 그대로 넘긴다 (§5-5)
      onDone(earned);
    } catch (e) {
      setError(e instanceof Error ? e.message : '리뷰를 저장하지 못했어요.');
    } finally {
      setBusy(false);
    }
  }

  const body = (
    <div
      className="flex flex-col gap-7 text-[#2A211B] dark:text-[#F2ECE6]"
      style={{ fontFamily: SYSTEM_FONT }}
    >
      {/* iOS 햅틱용 — 화면·접근성 트리·포커스 순서에서 모두 뺀다 */}
      <input
        ref={hapticInputRef}
        id={hapticId}
        type="checkbox"
        aria-hidden="true"
        tabIndex={-1}
        className="pointer-events-none sr-only"
      />
      <label
        ref={hapticLabelRef}
        htmlFor={hapticId}
        aria-hidden="true"
        tabIndex={-1}
        className="pointer-events-none sr-only"
      />
      {/* 개수 글자와 포인트 배지를 나눠 보여준다 */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[#8C6A4F] dark:text-[#C9AE95]">
          입력한 정보 <span className={`${display.className} text-base`}>{selected.length}</span>개
        </p>
        <span
          className={`${display.className} rounded-full bg-[#FFB547] px-3 py-1 text-base leading-none text-[#2A211B]`}
        >
          +{earned} P
        </span>
      </div>

      {loadError && <p className="text-sm text-[#D2301E]">{loadError}</p>}
      {!tags && !loadError && (
        <p className="text-sm text-[#8C6A4F] dark:text-[#C9AE95]">불러오는 중…</p>
      )}

      {groups.map((group) => {
        const groupTagIds = group.tags.map((t) => t.id);
        const inGroup = selected.filter((id) => groupTagIds.includes(id));
        const full = inGroup.length >= group.maxSelect;
        return (
          <section key={group.groupKey} className="flex flex-col gap-3">
            <h2 className="text-sm font-bold">
              {group.groupLabel}
              <span className="ml-2 font-normal text-[#8C6A4F] dark:text-[#C9AE95]">
                {group.groupKind === 'evaluative' || group.maxSelect === 1
                  ? '1개'
                  : `최대 ${group.maxSelect}개`}
              </span>
            </h2>
            <div className="flex flex-wrap gap-2">
              {group.tags.map((tag) => {
                const on = selected.includes(tag.id);
                // maxSelect가 1인 그룹은 바꿔 고를 수 있으므로 막지 않는다
                const blocked = !on && full && group.maxSelect > 1;
                return (
                  <button
                    key={tag.id}
                    type="button"
                    aria-pressed={on}
                    disabled={blocked || busy}
                    className={`min-h-11 rounded-full border px-4 py-2.5 text-sm ${
                      on
                        ? 'border-[#E8432E] bg-[#E8432E] font-medium text-white'
                        : 'border-[#E7E3DE] dark:border-white/20'
                    } ${blocked ? 'opacity-30' : ''}`}
                    onClick={() => toggle(tag, groupTagIds, group.maxSelect)}
                  >
                    {tag.label}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}

      {error && <p className="text-sm text-[#D2301E]">{error}</p>}

      {/* 버튼은 가로 꽉 차게. 주 행동(제출)이 위, 건너뛰기는 아래 조용히 */}
      <div className="flex flex-col gap-2 pt-1">
        <button
          type="button"
          className="min-h-[52px] w-full rounded-lg bg-[#E8432E] px-4 font-medium text-white disabled:opacity-40"
          disabled={selected.length === 0 || busy}
          onClick={submit}
        >
          {busy ? '저장 중…' : '제출'}
        </button>
        <button
          type="button"
          className="min-h-[52px] w-full rounded-lg px-4 font-medium text-[#8C6A4F] dark:text-[#C9AE95]"
          disabled={busy}
          onClick={() => onDone(0)}
        >
          건너뛰기
        </button>
      </div>
    </div>
  );

  // 온보딩에서는 화면 안에 그대로, 그 밖에서는 하단 바텀시트
  if (embedded) return body;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#2A211B]/40">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="어땠어?"
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-[var(--background)] px-4 pb-6 pt-4"
      >
        <div className="mb-4 flex items-center justify-between">
          <h1 className={`${display.className} text-2xl text-[#2A211B] dark:text-[#F2ECE6]`}>
            어땠어?
          </h1>
          <button
            type="button"
            aria-label="닫기"
            className="min-h-11 px-2 text-xl text-[#8C6A4F] dark:text-[#C9AE95]"
            disabled={busy}
            onClick={() => onDone(0)}
          >
            ✕
          </button>
        </div>
        {body}
      </div>
    </div>
  );
}
