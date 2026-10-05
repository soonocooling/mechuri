'use client';
// 담당 C — plan.md §10, §5-4 태그 필터 시트 (그룹 안 OR, 그룹끼리 AND)
import type { Category } from '@/lib/types';

type FilterSheetProps = {
  category: Category | '전체';
  selectedTagIds: number[];
  onChange: (next: { category: Category | '전체'; selectedTagIds: number[] }) => void;
};

export default function FilterSheet({ category, selectedTagIds, onChange }: FilterSheetProps) {
  return <div>필터</div>;
}
