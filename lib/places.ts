// 담당 A — plan.md §10, §8
import type { Category, KakaoPlace, Place } from './types';
import { supabase } from './supabase';
import { toCategory } from './categorize';

type PlaceRow = {
  id: number;
  kakao_place_id: string;
  name: string;
  address: string;
  category: string;
  kakao_category: string;
  lat: number;
  lng: number;
};

const COLUMNS = 'id, kakao_place_id, name, address, category, kakao_category, lat, lng';

function toPlace(r: PlaceRow): Place {
  return {
    id: r.id,
    kakaoPlaceId: r.kakao_place_id,
    name: r.name,
    address: r.address,
    category: r.category as Category,
    kakaoCategory: r.kakao_category,
    lat: r.lat,
    lng: r.lng,
  };
}

async function findByKakaoId(kakaoPlaceId: string): Promise<Place | null> {
  const { data, error } = await supabase
    .from('places')
    .select(COLUMNS)
    .eq('kakao_place_id', kakaoPlaceId)
    .maybeSingle<PlaceRow>();
  if (error) throw new Error(error.message);
  return data ? toPlace(data) : null;
}

/** places에 kakao_place_id가 있으면 그 행, 없으면 추가 (plan.md §8) */
export async function ensurePlace(k: KakaoPlace): Promise<Place> {
  const existing = await findByKakaoId(k.kakaoPlaceId);
  if (existing) return existing;

  const { data, error } = await supabase
    .from('places')
    .insert({
      kakao_place_id: k.kakaoPlaceId,
      name: k.name,
      address: k.address,
      category: toCategory(k.categoryName, k.groupCode),
      kakao_category: k.categoryName,
      lat: k.lat,
      lng: k.lng,
    })
    .select(COLUMNS)
    .single<PlaceRow>();
  if (data) return toPlace(data);

  // 동시에 다른 사람이 먼저 추가했으면 중복 오류(23505) → 다시 조회
  if (error?.code === '23505') {
    const again = await findByKakaoId(k.kakaoPlaceId);
    if (again) return again;
  }
  throw new Error(error?.message ?? '가게를 저장하지 못했어요.');
}

/** ids 없으면 전체 */
export async function getPlaces(ids?: number[]): Promise<Map<number, Place>> {
  if (ids && ids.length === 0) return new Map();
  let query = supabase.from('places').select(COLUMNS);
  if (ids) query = query.in('id', ids);
  const { data, error } = await query.returns<PlaceRow[]>();
  if (error) throw new Error(error.message);
  return new Map(data.map((r) => [r.id, toPlace(r)]));
}
