'use client';
// 담당 C — plan.md §10 가게 상세 시트 (화면 2)
type PlaceDetailProps = {
  placeId: number;
  onClose: () => void;
};

export default function PlaceDetail({ placeId, onClose }: PlaceDetailProps) {
  return <div>가게 상세</div>;
}
