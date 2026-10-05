// 담당 A — plan.md §8 카카오 검색
// 이 라우트는 DB를 건드리지 않는다 (plan.md §0). REST 키는 서버에서만 읽는다.
import type { NextRequest } from 'next/server';
import type { KakaoPlace } from '@/lib/types';

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q') ?? '';

  // 뼈대: 더미값. 구현 시 아래를 호출하고 FD6·CE7만 KakaoPlace[]로 바꿔 돌려준다.
  // https://dapi.kakao.com/v2/local/search/keyword.json?query=…&x=126.669&y=37.382&radius=3000&sort=distance
  // headers: { Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY}` }
  const places: KakaoPlace[] = [];

  return Response.json(places);
}
