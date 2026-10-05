// 담당 C — plan.md §10, §5-3 태그 부여
import type { CurrentReview, Tag } from './types';

/** 뼈대: 더미값. 윌슨 하한 z=1.96 (plan.md §5-3)
 *  검산: LB(2,2)=0.342, LB(1,1)=0.207, LB(3,3)=0.438, LB(5,8)=0.306 */
export function wilsonLB(k: number, n: number): number {
  return 0;
}

/** 뼈대: 더미값. positive = 통과한 평가형 group_key 목록 */
export function computeTagStats(
  reviews: CurrentReview[],
  tags: Tag[]
): Map<number, { assignedTagIds: number[]; positive: string[] }> {
  return new Map();
}
