'use client';
// 담당 B — plan.md §10 칩 선택 시트
// 제출은 lib/reviews.ts의 submitReview(= §4-1 submit_review RPC)를 부른다
import type { Category, ReviewSource } from '@/lib/types';

type ReviewSheetProps = {
  placeId: number;
  placeCategory: Category;
  source: ReviewSource;
  embedded?: boolean;              // 온보딩 화면 안에 끼울 때 true
  onDone: (earned: number) => void; // 제출 또는 건너뛰기 후 호출(건너뛰기면 0)
};

export default function ReviewSheet({
  placeId,
  placeCategory,
  source,
  embedded,
  onDone,
}: ReviewSheetProps) {
  return <div>어땠어?</div>;
}
