'use client';
// 담당 C — plan.md §10, §5-4 태그 필터 시트 (그룹 안 OR, 그룹끼리 AND)
// 판정은 lib/ranking.ts의 matchesFilter. 이 시트는 칩 고르기만 한다.
// 평가형(청결·친절·가성비·양·대기)은 +1 칩만 토글로 보여준다 → 고르면 "긍정 통과한 가게만"
import { useState } from 'react';
import type { Category, Tag } from '@/lib/types';
import { sortTags } from '@/lib/tagStats';

type FilterSheetProps = {
  category: Category | '전체';
  selectedTagIds: number[];
  onChange: (next: { category: Category | '전체'; selectedTagIds: number[] }) => void;
  tags: Tag[];
  onClose: () => void;
};

/** 대분류가 바뀌면 그 대분류에 안 맞는 음식 종류 칩은 빼야 한다 → 순위 탭에서도 쓴다 */
export function dropMismatchedCuisine(
  selectedTagIds: number[],
  category: Category | '전체',
  tags: Tag[]
): number[] {
  if (category === '전체') return selectedTagIds;
  const tagById = new Map(tags.map((t) => [t.id, t]));
  return selectedTagIds.filter((id) => {
    const t = tagById.get(id);
    return t && (t.groupKey !== 'cuisine' || t.parentLabel === category);
  });
}

export default function FilterSheet({ category, selectedTagIds, onChange, tags, onClose }: FilterSheetProps) {
  // 시트 안에서 고르는 동안은 임시 상태, [적용]을 눌러야 순위에 반영
  const [draft, setDraft] = useState<number[]>(selectedTagIds);

  // 그룹 순서는 plan.md §6 (음식 종류 → 맛 → 분위기 → 상황 → 가격대 → 평가형)
  const groups: { key: string; label: string; chips: Tag[] }[] = [];
  for (const t of sortTags(tags)) {
    if (t.groupKey === 'cuisine' && category !== '전체' && t.parentLabel !== category) continue;
    if (t.groupKind === 'evaluative' && t.value !== 1) continue;
    const label = t.groupKind === 'evaluative' ? '평가 좋은 곳만' : t.groupLabel;
    const key = t.groupKind === 'evaluative' ? 'evaluative' : t.groupKey;
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = { key, label, chips: [] };
      groups.push(g);
    }
    g.chips.push(t);
  }

  function chipText(t: Tag) {
    return t.groupKind === 'evaluative' ? `${t.groupLabel} ${t.label}` : t.label;
  }

  function toggle(id: number) {
    setDraft((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-label="필터"
        className="flex max-h-[85vh] w-full max-w-md flex-col rounded-t-2xl bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-lg font-semibold">필터</h2>
          <button type="button" aria-label="닫기" className="px-1 text-gray-400" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-5 overflow-y-auto px-5 py-4">
          {tags.length === 0 && <p className="text-sm text-gray-500">태그를 불러오지 못했어요.</p>}
          {groups.map((g) => (
            <section key={g.key}>
              <h3 className="mb-2 text-sm font-medium text-gray-600">{g.label}</h3>
              <div className="flex flex-wrap gap-2">
                {g.chips.map((t) => {
                  const on = draft.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={on}
                      className={`rounded-full border px-3 py-1 text-sm ${
                        on ? 'border-black bg-black text-white' : 'border-gray-300'
                      }`}
                      onClick={() => toggle(t.id)}
                    >
                      {chipText(t)}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
          <p className="text-xs text-gray-400">
            같은 줄 안에서는 하나만 맞아도, 다른 줄끼리는 모두 맞아야 보여요. 리뷰로 충분히 확인된 태그만 인정해요.
          </p>
        </div>

        <div className="flex gap-2 border-t border-gray-100 px-5 py-4">
          <button
            type="button"
            className="flex-1 rounded-lg border border-gray-300 py-3 font-medium"
            onClick={() => setDraft([])}
          >
            초기화
          </button>
          <button
            type="button"
            className="flex-[2] rounded-lg bg-black py-3 font-medium text-white"
            onClick={() => {
              onChange({ category, selectedTagIds: draft });
              onClose();
            }}
          >
            적용{draft.length > 0 ? ` (${draft.length})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
