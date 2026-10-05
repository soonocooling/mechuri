'use client';
// 담당 B — plan.md §10 칩 선택 시트
// 제출은 lib/reviews.ts의 submitReview(= §4-1 submit_review RPC)를 부른다
import { useEffect, useMemo, useState } from 'react';
import type { Category, ReviewSource, Tag } from '@/lib/types';
import { getTags, groupTags } from '@/lib/tags';
import { submitReview } from '@/lib/reviews';

type ReviewSheetProps = {
  placeId: number;
  placeCategory: Category;
  source: ReviewSource;
  embedded?: boolean;              // 온보딩 화면 안에 끼울 때 true
  onDone: (earned: number) => void; // 제출 또는 건너뛰기 후 호출(건너뛰기면 0)
};

export default function ReviewSheet({
  placeId,
  placeCategory,
  source,
  embedded,
  onDone,
}: ReviewSheetProps) {
  const [tags, setTags] = useState<Tag[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 칩 목록은 열 때 한 번만 읽는다 (plan.md §6 시드 72행)
  useEffect(() => {
    let alive = true;
    getTags().then(
      (all) => {
        if (alive) setTags(all);
      },
      () => {
        if (alive) setLoadError('칩을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
      }
    );
    return () => {
      alive = false;
    };
  }, []);

  // cuisine은 가게 대분류와 parentLabel이 같은 칩만 (기타면 전부, §6)
  const groups = useMemo(
    () => (tags ? groupTags(tags, placeCategory) : []),
    [tags, placeCategory]
  );

  function toggle(tag: Tag, groupTagIds: number[], maxSelect: number) {
    setError(null);
    setSelected((prev) => {
      if (prev.includes(tag.id)) return prev.filter((id) => id !== tag.id);
      const inGroup = prev.filter((id) => groupTagIds.includes(id));
      // 평가형·가격대처럼 한 개만 고르는 그룹은 누른 칩으로 바꿔준다
      if (maxSelect === 1) return [...prev.filter((id) => !groupTagIds.includes(id)), tag.id];
      // 서술형은 max_select를 넘으면 더 고를 수 없다 (§4-1 — 이 검사는 앱에서)
      if (inGroup.length >= maxSelect) return prev;
      return [...prev, tag.id];
    });
  }

  async function submit() {
    if (selected.length === 0 || busy) return;
    setError(null);
    setBusy(true);
    try {
      await submitReview(placeId, selected, source);
      // TODO(B2): previewPoints로 계산한 적립 포인트를 넘긴다 (plan.md §5-5)
      onDone(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : '리뷰를 저장하지 못했어요.');
    } finally {
      setBusy(false);
    }
  }

  const body = (
    <div className="flex flex-col gap-5">
      {/* TODO(B2): "입력한 정보 N개 · +N P" — getReviewContext 1회 + previewPoints (plan.md §5-5) */}
      <p className="text-sm text-gray-500">입력한 정보 {selected.length}개</p>

      {loadError && <p className="text-sm text-red-600">{loadError}</p>}
      {!tags && !loadError && <p className="text-sm text-gray-500">불러오는 중…</p>}

      {groups.map((group) => {
        const groupTagIds = group.tags.map((t) => t.id);
        const inGroup = selected.filter((id) => groupTagIds.includes(id));
        const full = inGroup.length >= group.maxSelect;
        return (
          <section key={group.groupKey} className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">
              {group.groupLabel}
              <span className="ml-2 font-normal text-gray-500">
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
                        ? 'border-black bg-black font-medium text-white'
                        : 'border-gray-300 text-gray-700'
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

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          className="min-h-12 rounded-lg border border-gray-300 px-4 font-medium text-gray-600"
          disabled={busy}
          onClick={() => onDone(0)}
        >
          건너뛰기
        </button>
        <button
          type="button"
          className="min-h-12 flex-1 rounded-lg bg-black font-medium text-white disabled:opacity-40"
          disabled={selected.length === 0 || busy}
          onClick={submit}
        >
          {busy ? '저장 중…' : '제출'}
        </button>
      </div>
    </div>
  );

  // 온보딩에서는 화면 안에 그대로, 그 밖에서는 하단 바텀시트
  if (embedded) return body;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="어땠어?"
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-[var(--background)] px-4 pb-6 pt-4"
      >
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold">어땠어?</h1>
          <button
            type="button"
            aria-label="닫기"
            className="min-h-11 px-2 text-xl text-gray-400"
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
