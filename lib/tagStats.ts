// 담당 C — plan.md §10, §5-3 태그 부여
import type { CurrentReview, Tag } from './types';

const Z = 1.96;
/** 서술형 태그 부여 기준 (plan.md §5-3) */
export const DESCRIPTIVE_THRESHOLD = 0.3;
/** 평가형 "긍정 통과" 기준 (plan.md §5-3) */
export const EVALUATIVE_THRESHOLD = 0.4;

/** 그룹 표시 순서 (plan.md §6 표 순서).
 *  tags.id 순서에 기대면 안 된다 — schema.sql 시드의 insert … where not exists 는
 *  Postgres가 행 순서를 섞을 수 있어서 id가 표 순서대로 매겨진다는 보장이 없다. */
export const GROUP_ORDER = ['cuisine', 'taste', 'mood', 'situation', 'price', 'clean', 'kind', 'value', 'portion', 'wait'];

/** 부여 태그를 카드에 보여줄 때, LB가 같으면 이 순서로 (대분류는 카드에 이미 보이니 음식 종류는 뒤로) */
const CARD_TIE_ORDER = ['taste', 'situation', 'mood', 'cuisine', 'price'];

const rankOf = (order: string[], key: string) => {
  const i = order.indexOf(key);
  return i === -1 ? order.length : i;
};

/** 그룹은 GROUP_ORDER, 그룹 안은 sort 순으로 정렬한 새 배열 */
export function sortTags(tags: Tag[]): Tag[] {
  return [...tags].sort(
    (a, b) => rankOf(GROUP_ORDER, a.groupKey) - rankOf(GROUP_ORDER, b.groupKey) || a.sort - b.sort
  );
}

/** 윌슨 점수 구간 하한, z = 1.96 (plan.md §5-3)
 *  검산: LB(2,2)=0.342, LB(1,1)=0.207, LB(3,3)=0.438, LB(5,8)=0.306 */
export function wilsonLB(k: number, n: number): number {
  if (n <= 0) return 0;
  const p = k / n;
  const z2 = Z * Z;
  const center = p + z2 / (2 * n);
  const margin = Z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return (center - margin) / (1 + z2 / n);
}

/** 가게 하나의 그룹별 집계 — 상세 시트(PlaceDetail)가 분포·비율을 그릴 때도 쓴다 */
export type GroupBreakdown = {
  groupKey: string;
  groupLabel: string;
  groupKind: 'descriptive' | 'evaluative';
  /** 서술형: 이 그룹 칩을 1개 이상 고른 현재 리뷰 수 / 평가형: 응답 수 */
  n: number;
  /** 칩별 선택 수와 윌슨 하한. 칩 sort 순서 */
  chips: { tagId: number; label: string; value: number | null; k: number; lb: number }[];
};

/** 한 가게의 현재 리뷰들로 그룹별 집계를 만든다 (plan.md §5-3의 n, k 정의 그대로).
 *  reviews에 다른 가게 리뷰가 섞여 있으면 placeId로 걸러서 쓴다. */
export function breakdownForPlace(
  placeId: number,
  reviews: CurrentReview[],
  tags: Tag[]
): GroupBreakdown[] {
  const tagById = new Map(tags.map((t) => [t.id, t]));
  const groups = new Map<string, GroupBreakdown>();
  // 그룹은 GROUP_ORDER, 칩은 그룹 안에서 sort순
  for (const t of sortTags(tags)) {
    let g = groups.get(t.groupKey);
    if (!g) {
      g = { groupKey: t.groupKey, groupLabel: t.groupLabel, groupKind: t.groupKind, n: 0, chips: [] };
      groups.set(t.groupKey, g);
    }
    g.chips.push({ tagId: t.id, label: t.label, value: t.value, k: 0, lb: 0 });
  }

  for (const r of reviews) {
    if (r.placeId !== placeId) continue;
    const touched = new Set<string>();
    for (const tagId of new Set(r.tagIds)) {
      const t = tagById.get(tagId);
      if (!t) continue;
      touched.add(t.groupKey);
      const chip = groups.get(t.groupKey)!.chips.find((c) => c.tagId === tagId)!;
      chip.k += 1;
    }
    for (const key of touched) groups.get(key)!.n += 1;
  }

  for (const g of groups.values()) {
    for (const c of g.chips) c.lb = wilsonLB(c.k, g.n);
  }
  return [...groups.values()];
}

/** 가게별 부여 태그·긍정 통과 그룹 (plan.md §5-3)
 *  - assignedTagIds: 서술형 중 LB ≥ 0.30. **LB 높은 순**(같으면 맛→상황→분위기→음식 종류→가격)이라 앞에서 3개 자르면 카드 표시용
 *  - positive: 평가형 그룹 중 value +1 응답의 LB ≥ 0.40 인 group_key
 *  리뷰가 하나라도 있는 가게만 Map에 들어간다. 없는 가게는 get() 결과가 undefined → 빈 값으로 취급 */
export function computeTagStats(
  reviews: CurrentReview[],
  tags: Tag[]
): Map<number, { assignedTagIds: number[]; positive: string[] }> {
  const placeIds = [...new Set(reviews.map((r) => r.placeId))];
  const byPlace = new Map<number, CurrentReview[]>();
  for (const r of reviews) {
    const arr = byPlace.get(r.placeId);
    if (arr) arr.push(r);
    else byPlace.set(r.placeId, [r]);
  }

  const result = new Map<number, { assignedTagIds: number[]; positive: string[] }>();
  for (const placeId of placeIds) {
    const groups = breakdownForPlace(placeId, byPlace.get(placeId)!, tags);
    const assigned: { tagId: number; lb: number; order: number }[] = [];
    const positive: string[] = [];
    for (const g of groups) {
      if (g.groupKind === 'descriptive') {
        g.chips.forEach((c, i) => {
          const order = rankOf(CARD_TIE_ORDER, g.groupKey) * 100 + i;
          if (g.n > 0 && c.lb >= DESCRIPTIVE_THRESHOLD) assigned.push({ tagId: c.tagId, lb: c.lb, order });
        });
      } else {
        const plus = g.chips.find((c) => c.value === 1);
        if (plus && g.n > 0 && plus.lb >= EVALUATIVE_THRESHOLD) positive.push(g.groupKey);
      }
    }
    assigned.sort((a, b) => b.lb - a.lb || a.order - b.order);
    result.set(placeId, { assignedTagIds: assigned.map((a) => a.tagId), positive });
  }
  return result;
}
