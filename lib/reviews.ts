// 담당 B — plan.md §10, §5-1
import type { CurrentReview, ReviewSource } from './types';
import { supabase } from './supabase';

type RpcError = { message?: string; code?: string };

/** DB·네트워크 오류를 사용자에게 보여줄 한국어 한 줄로 바꾼다 (§4-1 submit_review의 raise exception 포함) */
function toUserMessage(error: RpcError): string {
  const raw = error.message ?? '';
  if (raw.includes('not authenticated') || error.code === '42501')
    return '로그인이 필요해요. 다시 로그인한 뒤 시도해 주세요.';
  if (raw.includes('at least one tag')) return '칩을 하나 이상 골라주세요.';
  if (raw.includes('duplicate tag_ids')) return '같은 칩을 두 번 골랐어요. 다시 골라주세요.';
  if (error.code === '23503')
    return '가게나 칩 정보를 찾지 못했어요. 새로고침한 뒤 다시 시도해 주세요.';
  if (/fetch|network/i.test(raw)) return '연결이 불안정해요. 잠시 후 다시 시도해 주세요.';
  return '리뷰를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.';
}

/** plan.md §4-1 submit_review RPC. reviews 1줄 + review_tags N줄, 새 review id 반환.
 *  그룹별 max_select·평가형 1개 검사는 ReviewSheet에서 한다 */
export async function submitReview(
  placeId: number,
  tagIds: number[],
  source: ReviewSource
): Promise<number> {
  const { data, error } = await supabase.rpc('submit_review', {
    p_place_id: placeId,
    p_tag_ids: tagIds,
    p_source: source,
  });
  if (error) throw new Error(toUserMessage(error));
  return data as number;
}

type ReviewRow = {
  id: number;
  user_id: string;
  place_id: number;
  created_at: string;
  review_tags: { tag_id: number }[];
};

const REVIEW_COLUMNS = 'id, user_id, place_id, created_at, review_tags(tag_id)';

/** reviews 전체 + review_tags. created_at이 같으면 id로 순서를 정한다 (plan.md §5-1) */
async function getReviewRows(ascending: boolean): Promise<ReviewRow[]> {
  const { data, error } = await supabase
    .from('reviews')
    .select(REVIEW_COLUMNS)
    .order('created_at', { ascending })
    .order('id', { ascending })
    .returns<ReviewRow[]>();
  if (error) throw new Error(error.message);
  return data;
}

/** 정렬된 rows에서 (user_id, place_id)별 첫 줄만 남긴다 */
function firstPerUserPlace(rows: ReviewRow[]): CurrentReview[] {
  const seen = new Set<string>();
  const reviews: CurrentReview[] = [];
  for (const r of rows) {
    const key = `${r.user_id}:${r.place_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    reviews.push({
      reviewId: r.id,
      userId: r.user_id,
      placeId: r.place_id,
      tagIds: r.review_tags.map((t) => t.tag_id).sort((a, b) => a - b),
      createdAt: r.created_at,
    });
  }
  return reviews;
}

/** (user_id, place_id)별 created_at 최신 reviews + 그 review_tags (plan.md §5-1). 같으면 id 큰 쪽 */
export async function getCurrentReviews(): Promise<CurrentReview[]> {
  return firstPerUserPlace(await getReviewRows(false));
}

/** (user_id, place_id)별 created_at 최초 reviews (포인트 계산용). 같으면 id 작은 쪽 */
export async function getFirstReviews(): Promise<CurrentReview[]> {
  return firstPerUserPlace(await getReviewRows(true));
}
