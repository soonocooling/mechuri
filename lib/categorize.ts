// 담당 A — plan.md §5-8 카카오 → 대분류
import type { Category } from './types';

/** " > "로 나눈 2번째 단어 → 대분류 (plan.md §5-8 표) */
const SECOND_WORD: Record<string, Category> = {
  한식: '한식',
  중식: '중식',
  일식: '일식',
  양식: '양식',
  아시아음식: '아시안',
  분식: '분식',
  치킨: '치킨',
  패스트푸드: '버거·피자',
  술집: '술집',
  간식: '카페·디저트',
};

/** 판정 순서대로 위에서 먼저 걸리는 것 (plan.md §5-8) */
export function toCategory(categoryName: string, groupCode: string): Category {
  const words = categoryName.split('>').map((w) => w.trim());

  // 1. 마지막 단어가 "회" (카카오가 횟집을 "한식 > 해물,생선 > 회"로 주는 경우)
  if (words[words.length - 1] === '회') return '일식';
  // 2. 어디든 "샐러드" 포함
  if (categoryName.includes('샐러드')) return '샐러드·건강식';
  // 3. 3번째 단어가 "피자" (카카오가 "양식 > 피자"로 주는 경우)
  if (words[2] === '피자') return '버거·피자';
  // 4. 카페 그룹
  if (groupCode === 'CE7') return '카페·디저트';
  // 5. 2번째 단어로 표, 그 외 기타
  return SECOND_WORD[words[1]] ?? '기타';
}
