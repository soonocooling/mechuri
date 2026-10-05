// 담당 A — plan.md §10, §5-1
import type { ListItem } from './types';
import { supabase } from './supabase';

type ListRow = {
  id: number;
  user_id: string;
  ranking_items: { place_id: number; rank: number }[];
};

function toItems(row: ListRow): ListItem[] {
  return row.ranking_items
    .map((i) => ({ placeId: i.place_id, rank: i.rank }))
    .sort((a, b) => a.rank - b.rank);
}

/** 사용자별 created_at 최신 ranking_lists의 ranking_items (plan.md §5-1). 없으면 [] */
export async function getCurrentList(userId: string): Promise<ListItem[]> {
  const { data, error } = await supabase
    .from('ranking_lists')
    .select('id, user_id, ranking_items(place_id, rank)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .returns<ListRow[]>();
  if (error) throw new Error(error.message);
  return data.length ? toItems(data[0]) : [];
}

/** key = userId. 최신순으로 받아 사용자별 첫 줄만 남긴다 */
export async function getAllCurrentLists(): Promise<Map<string, ListItem[]>> {
  const { data, error } = await supabase
    .from('ranking_lists')
    .select('id, user_id, ranking_items(place_id, rank)')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .returns<ListRow[]>();
  if (error) throw new Error(error.message);

  const lists = new Map<string, ListItem[]>();
  for (const row of data) {
    if (!lists.has(row.user_id)) lists.set(row.user_id, toItems(row));
  }
  return lists;
}

/** plan.md §4-1 save_list RPC. 배열 순서 = rank 1..n, 새 list id 반환 */
export async function saveList(placeIds: number[], isOnboarding: boolean): Promise<number> {
  const { data, error } = await supabase.rpc('save_list', {
    p_place_ids: placeIds,
    p_is_onboarding: isOnboarding,
  });
  if (error) throw new Error(error.message);
  return data as number;
}
