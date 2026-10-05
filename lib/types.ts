// plan.md §10 "함수 약속" — 공통 타입. 바꾸려면 plan.md §10 먼저 고친다.

export type Category = '한식' | '중식' | '일식' | '양식' | '아시안' | '분식' | '치킨'
  | '버거·피자' | '샐러드·건강식' | '카페·디저트' | '술집' | '기타';

export type Place = { id: number; kakaoPlaceId: string; name: string; address: string;
  category: Category; kakaoCategory: string; lat: number; lng: number };

export type KakaoPlace = { kakaoPlaceId: string; name: string; address: string;
  categoryName: string; groupCode: string; lat: number; lng: number };

export type ListItem = { placeId: number; rank: number };

export type Tag = { id: number; groupKey: string; groupLabel: string;
  groupKind: 'descriptive' | 'evaluative'; maxSelect: number; label: string;
  parentLabel: string | null; value: number | null; sort: number };

export type CurrentReview = { reviewId: number; userId: string; placeId: number;
  tagIds: number[]; createdAt: string };

export type ReviewSource = 'onboarding' | 'review' | 'list_add';

export type RecKind = 'free' | 'point' | 'premium';

export type RecItem = { placeId: number; reason: string };
