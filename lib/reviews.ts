// 담당 B — plan.md §10, §5-1
import type { CurrentReview, ReviewSource } from './types';

/** 뼈대: 더미값. 구현 시 plan.md §4-1의 submit_review RPC를 부를 자리:
 *  supabase.rpc('submit_review', { p_place_id: placeId, p_tag_ids: tagIds, p_source: source })
 *  → 새 review id 반환 */
export async function submitReview(
  placeId: number,
  tagIds: number[],
  source: ReviewSource
): Promise<number> {
  return 0;
}

/** 뼈대: 더미값. (user_id, place_id)별 created_at 최신 reviews (plan.md §5-1) */
export async function getCurrentReviews(): Promise<CurrentReview[]> {
  return [];
}

/** 뼈대: 더미값. (user_id, place_id)별 created_at 최초 reviews (포인트 계산용) */
export async function getFirstReviews(): Promise<CurrentReview[]> {
  return [];
}
