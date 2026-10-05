// 담당 A — plan.md §8 카카오 검색
// 이 라우트는 DB를 건드리지 않는다 (plan.md §0). REST 키는 서버에서만 읽는다.
import type { NextRequest } from 'next/server';
import type { KakaoPlace } from '@/lib/types';

type KakaoDoc = {
  id: string;
  place_name: string;
  address_name: string;
  road_address_name: string;
  category_name: string;
  category_group_code: string;
  x: string; // 경도
  y: string; // 위도
};

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (!q) return Response.json([]);

  const url = new URL('https://dapi.kakao.com/v2/local/search/keyword.json');
  url.search = new URLSearchParams({
    query: q,
    x: '126.669',
    y: '37.382',
    radius: '3000',
    sort: 'distance',
    size: '15',
  }).toString();

  const res = await fetch(url, {
    headers: { Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    return Response.json({ error: `kakao ${res.status}` }, { status: 502 });
  }

  const { documents } = (await res.json()) as { documents: KakaoDoc[] };
  // 음식점(FD6)·카페(CE7)만 (plan.md §8)
  const places: KakaoPlace[] = documents
    .filter((d) => d.category_group_code === 'FD6' || d.category_group_code === 'CE7')
    .map((d) => ({
      kakaoPlaceId: d.id,
      name: d.place_name,
      address: d.road_address_name || d.address_name,
      categoryName: d.category_name,
      groupCode: d.category_group_code,
      lat: Number(d.y),
      lng: Number(d.x),
    }));

  return Response.json(places);
}
