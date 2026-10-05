'use client';
// 담당 C — plan.md §10 지도 (여유 있을 때, plan.md §11 우선순위 3)
// 키는 NEXT_PUBLIC_KAKAO_MAP_KEY (공개 가능, 도메인 제한)
type KakaoMapProps = {
  placeIds: number[];
};

export default function KakaoMap({ placeIds }: KakaoMapProps) {
  return <div>지도</div>;
}
