// 담당 C — plan.md §10, §5-2 순위 점수, §5-4 필터
import type { Category, ListItem, Place, Tag } from './types';

/** 위치 가중치 w(r) = 1 / log₂(r + 1) → w(1)=1, w(2)=0.631, w(3)=0.5, w(10)=0.289 */
export function rankWeight(rank: number): number {
  return 1 / Math.log2(rank + 1);
}

/** 보정 상수 m (plan.md §5-2: S̃ = S · n/(n+2)) */
const M = 2;

/** 가게별 점수 (plan.md §5-2)
 *  - score = S̃(p) = S(p) · n_p / (n_p + 2),  S(p) = Σ_u w(r_u(p))  (현재 리스트 기준)
 *  - n = p를 현재 리스트에 넣은 사용자 수, nFirst = p를 1위로 꼽은 사용자 수
 *  lists는 A의 getAllCurrentLists() 결과(key = userId, 값 = 그 사용자의 현재 리스트)를 그대로 넣는다.
 *  n = 1인 가게도 Map에 들어간다(“신규 발견” 표시용). 순위 노출 여부는 rankPlaces가 가른다. */
export function computeScores(
  lists: Map<string, ListItem[]>
): Map<number, { score: number; n: number; nFirst: number }> {
  const acc = new Map<number, { s: number; n: number; nFirst: number }>();
  for (const items of lists.values()) {
    const seen = new Set<number>(); // 한 사용자가 같은 가게를 두 번 넣는 일은 DB 제약상 없지만 방어
    for (const { placeId, rank } of items) {
      if (seen.has(placeId)) continue;
      seen.add(placeId);
      const a = acc.get(placeId) ?? { s: 0, n: 0, nFirst: 0 };
      a.s += rankWeight(rank);
      a.n += 1;
      if (rank === 1) a.nFirst += 1;
      acc.set(placeId, a);
    }
  }

  const out = new Map<number, { score: number; n: number; nFirst: number }>();
  for (const [placeId, a] of acc) {
    out.set(placeId, { score: (a.s * a.n) / (a.n + M), n: a.n, nFirst: a.nFirst });
  }
  return out;
}

export type RankedPlace = {
  /** 전체 순위(1부터). 신규 발견은 null */
  rank: number | null;
  place: Place;
  score: number;
  n: number;
  nFirst: number;
};

/** 정렬 규칙 (plan.md §5-2): S̃ ↓ → n ↓ → 1위 표 수 ↓ → 이름 ↑ */
export function compareRanked(a: Omit<RankedPlace, 'rank'>, b: Omit<RankedPlace, 'rank'>): number {
  return (
    b.score - a.score ||
    b.n - a.n ||
    b.nFirst - a.nFirst ||
    a.place.name.localeCompare(b.place.name, 'ko')
  );
}

/** 점수 + 가게 정보 → { ranked: n ≥ 2 정렬·순위 매김, newcomers: n = 1 “신규 발견” }
 *  places는 A의 getPlaces() 결과. 정보가 없는 placeId는 건너뛴다.
 *  필터를 걸 때도 “전체 순위 번호”를 유지하려면 이 결과를 먼저 만들고 그다음에 거른다. */
export function rankPlaces(
  scores: Map<number, { score: number; n: number; nFirst: number }>,
  places: Map<number, Place>
): { ranked: RankedPlace[]; newcomers: RankedPlace[] } {
  const rows: Omit<RankedPlace, 'rank'>[] = [];
  for (const [placeId, s] of scores) {
    const place = places.get(placeId);
    if (!place) continue;
    rows.push({ place, ...s });
  }
  rows.sort(compareRanked);
  const ranked = rows.filter((r) => r.n >= 2).map((r, i) => ({ ...r, rank: i + 1 }));
  const newcomers = rows.filter((r) => r.n < 2).map((r) => ({ ...r, rank: null }));
  return { ranked, newcomers };
}

/** 필터 판정 (plan.md §5-4)
 *  - 대분류: '전체'면 통과, 아니면 places.category 일치
 *  - 태그: 고른 칩을 group_key별로 묶어서 그룹 안은 OR, 그룹끼리는 AND
 *    · 서술형 칩 → computeTagStats의 assignedTagIds(§5-3 부여된 것)에 있어야 인정
 *    · 평가형 칩 → 그 그룹의 +1 칩(깨끗함·친절함·좋음·푸짐·바로 입장)을 고른 걸로 보고,
 *      computeTagStats의 positive에 그 group_key가 있으면 인정
 *  stats는 computeTagStats(...).get(placeId) — 리뷰가 없으면 undefined */
export function matchesFilter(
  place: Place,
  stats: { assignedTagIds: number[]; positive: string[] } | undefined,
  category: Category | '전체',
  selectedTagIds: number[],
  tags: Tag[]
): boolean {
  if (category !== '전체' && place.category !== category) return false;
  if (selectedTagIds.length === 0) return true;

  const tagById = new Map(tags.map((t) => [t.id, t]));
  const byGroup = new Map<string, Tag[]>();
  for (const id of selectedTagIds) {
    const t = tagById.get(id);
    if (!t) continue;
    const arr = byGroup.get(t.groupKey);
    if (arr) arr.push(t);
    else byGroup.set(t.groupKey, [t]);
  }

  const assigned = new Set(stats?.assignedTagIds ?? []);
  const positive = new Set(stats?.positive ?? []);
  for (const [groupKey, picked] of byGroup) {
    const ok = picked.some((t) =>
      t.groupKind === 'descriptive' ? assigned.has(t.id) : positive.has(groupKey)
    );
    if (!ok) return false;
  }
  return true;
}
