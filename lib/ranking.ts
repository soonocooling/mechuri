// 담당 C — plan.md §10, §5-2 순위 점수
import type { ListItem } from './types';

/** 뼈대: 더미값. score = S̃(p) = S(p)·n_p/(n_p+2) (plan.md §5-2) */
export function computeScores(
  lists: Map<string, ListItem[]>
): Map<number, { score: number; n: number; nFirst: number }> {
  return new Map();
}
