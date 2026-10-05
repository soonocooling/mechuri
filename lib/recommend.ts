// 담당 B — plan.md §10, §5-6 추천
import type { RecItem, RecKind } from './types';

/** 뼈대: 더미값. score = α·CF + (1−α)·(0.6·CB + 0.4·POP) (plan.md §5-6) */
export async function recommend(
  userId: string,
  kind: RecKind,
  excludeIds?: number[]
): Promise<RecItem[]> {
  return [];
}
