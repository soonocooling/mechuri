// 담당 A — plan.md §10, §5-1
import type { ListItem } from './types';

/** 뼈대: 더미값. 사용자별 created_at 최신 ranking_lists의 ranking_items (plan.md §5-1) */
export async function getCurrentList(userId: string): Promise<ListItem[]> {
  return [];
}

/** 뼈대: 더미값. key = userId */
export async function getAllCurrentLists(): Promise<Map<string, ListItem[]>> {
  return new Map();
}

/** 뼈대: 더미값. 구현 시 plan.md §4-1의 save_list RPC를 부를 자리:
 *  supabase.rpc('save_list', { p_place_ids: placeIds, p_is_onboarding: isOnboarding })
 *  → 새 list id 반환 */
export async function saveList(placeIds: number[], isOnboarding: boolean): Promise<number> {
  return 0;
}
