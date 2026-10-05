'use client';
// 담당 A — plan.md §10 검색창 + 결과 + 선택
// 선택 시 lib/places.ts의 ensurePlace로 places 행을 확보한다 (plan.md §8)
import type { KakaoPlace } from '@/lib/types';

type PlaceSearchProps = {
  onSelect: (k: KakaoPlace) => void;
};

export default function PlaceSearch({ onSelect }: PlaceSearchProps) {
  return <div>가게 검색</div>;
}
