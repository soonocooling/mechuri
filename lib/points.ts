// 담당 B — plan.md §10, §5-5 포인트
import type { Tag } from './types';
import { supabase } from './supabase';

/** 뼈대: 더미값. 잔액 = 적립 합 − 3 × (kind='point' recommendations 수) */
export async function getPointBalance(userId: string): Promise<number> {
  return 0;
}

/**
 * ReviewSheet가 열릴 때 한 번만 호출한다 (칩마다 DB 조회 금지, plan.md §5-5).
 * 로그인 세션 사용자 기준(§5-5).
 * - isFirst: 내가 이 가게에 남긴 리뷰가 하나도 없음 → 첫 리뷰라서 포인트가 붙는다 (§5-1 첫 리뷰)
 * - pioneer: 이 가게에 리뷰를 남긴 다른 사용자가 3명 미만 → 개척 보너스
 * 비로그인이거나 조회에 실패하면 포인트가 없는 것으로 본다.
 */
export async function getReviewContext(
  placeId: number
): Promise<{ isFirst: boolean; pioneer: boolean }> {
  try {
    const { data: auth, error: authError } = await supabase.auth.getUser();
    const me = auth?.user?.id;
    if (authError || !me) return { isFirst: false, pioneer: false };

    // reviews는 누구나 읽기(§4). 한 사용자가 여러 줄일 수 있어 사용자 단위로 중복을 제거한다
    const { data, error } = await supabase
      .from('reviews')
      .select('user_id')
      .eq('place_id', placeId)
      .returns<{ user_id: string }[]>();
    if (error || !data) return { isFirst: false, pioneer: false };

    const others = new Set<string>();
    let mine = 0;
    for (const row of data) {
      if (row.user_id === me) mine += 1;
      else others.add(row.user_id);
    }
    return { isFirst: mine === 0, pioneer: others.size < 3 };
  } catch {
    return { isFirst: false, pioneer: false };
  }
}

/**
 * 동기 함수 — 칩을 누를 때마다 계산한다 (DB 조회 없음, plan.md §5-5).
 * t = 고른 칩 수, g = 칩을 1개 이상 고른 그룹 수
 * - 첫 리뷰가 아니면 0P
 * - 기본: g ≥ 2 이고 t ≥ 3 → 1P, 개척이면 2P
 * - 풍부: g ≥ 5면 +1P (기본 충족 시에만)
 * 온보딩 완주 +3P는 여기서 더하지 않는다 (온보딩 화면이 따로 계산, §5-5)
 */
export function previewPoints(
  tagIds: number[],
  tags: Tag[],
  ctx: { isFirst: boolean; pioneer: boolean }
): number {
  if (!ctx.isFirst) return 0;

  const groupOf = new Map<number, string>(tags.map((tag) => [tag.id, tag.groupKey]));
  const counted = new Set<number>();
  const groups = new Set<string>();
  for (const id of tagIds) {
    const groupKey = groupOf.get(id);
    // tags에 없는 id는 어느 그룹인지 알 수 없어 세지 않는다
    if (groupKey === undefined || counted.has(id)) continue;
    counted.add(id);
    groups.add(groupKey);
  }

  const t = counted.size;
  const g = groups.size;
  if (g < 2 || t < 3) return 0;

  return (ctx.pioneer ? 2 : 1) + (g >= 5 ? 1 : 0);
}
