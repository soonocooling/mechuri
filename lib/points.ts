// 담당 B — plan.md §10, §5-5 포인트
import type { Tag } from './types';

/** 뼈대: 더미값. 잔액 = 적립 합 − 3 × (kind='point' recommendations 수) */
export async function getPointBalance(userId: string): Promise<number> {
  return 0;
}

/** 뼈대: 더미값. ReviewSheet가 열릴 때 한 번만 호출 (칩마다 DB 조회 금지) */
export async function getReviewContext(
  placeId: number
): Promise<{ isFirst: boolean; pioneer: boolean }> {
  return { isFirst: false, pioneer: false };
}

/** 뼈대: 더미값. 동기 함수 — 칩을 누를 때마다 계산 (plan.md §5-5) */
export function previewPoints(
  tagIds: number[],
  tags: Tag[],
  ctx: { isFirst: boolean; pioneer: boolean }
): number {
  return 0;
}
