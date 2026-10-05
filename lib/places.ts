// 담당 A — plan.md §10, §8
import type { KakaoPlace, Place } from './types';

/** 뼈대: 더미값. places에 kakao_place_id가 있으면 그 행, 없으면 추가 (plan.md §8) */
export async function ensurePlace(k: KakaoPlace): Promise<Place> {
  return {
    id: 0,
    kakaoPlaceId: k.kakaoPlaceId,
    name: k.name,
    address: k.address,
    category: '기타',
    kakaoCategory: k.categoryName,
    lat: k.lat,
    lng: k.lng,
  };
}

/** 뼈대: 더미값. ids 없으면 전체 */
export async function getPlaces(ids?: number[]): Promise<Map<number, Place>> {
  return new Map();
}
