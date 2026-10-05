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

/** 뼈대: 더미값. (user_id, place_id)별 created_at 최신 reviews (plan.md §5-1) */
export async function getCurrentReviews(): Promise<CurrentReview[]> {
  return [];
}

/** 뼈대: 더미값. (user_id, place_id)별 created_at 최초 reviews (포인트 계산용) */
export async function getFirstReviews(): Promise<CurrentReview[]> {
  return [];
}
