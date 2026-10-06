'use client';
// 담당 C — plan.md §10 지도 (여유 있을 때, plan.md §11 우선순위 3)
// 키는 NEXT_PUBLIC_KAKAO_MAP_KEY (공개 가능, 도메인 제한)
// → 키 주인의 카카오 앱 Web 플랫폼에 http://localhost:3000, Vercel 도메인이 등록돼 있어야 지도가 뜬다.
import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';

export type MapItem = { placeId: number; name: string; lat: number; lng: number; label: string };

type KakaoMapProps = {
  /** 순서대로 핀을 찍는다 (상위 30개는 부르는 쪽에서 자름) */
  items: MapItem[];
  onSelect: (placeId: number) => void;
};

// 국제캠퍼스 대략 좌표 (plan.md §8과 같은 값)
const CENTER = { lat: 37.382, lng: 126.669 };
const KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;

// 카카오 지도 SDK에서 쓰는 것만 최소로 타입 선언
type LatLng = object;
type KMap = { setBounds(b: LatLngBounds): void; setCenter(p: LatLng): void; relayout(): void };
type LatLngBounds = { extend(p: LatLng): void };
type Overlay = { setMap(m: KMap | null): void };
type KakaoMaps = {
  load(cb: () => void): void;
  LatLng: new (lat: number, lng: number) => LatLng;
  LatLngBounds: new () => LatLngBounds;
  Map: new (el: HTMLElement, opts: { center: LatLng; level: number }) => KMap;
  CustomOverlay: new (opts: { position: LatLng; content: HTMLElement; yAnchor?: number; clickable?: boolean }) => Overlay;
};
declare global {
  interface Window {
    kakao?: { maps: KakaoMaps };
  }
}

export default function KakaoMap({ items, onSelect }: KakaoMapProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<KMap | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // SDK 로드 후 지도 생성 + 핀 갱신
  useEffect(() => {
    const maps = window.kakao?.maps;
    if (!ready || !maps || !boxRef.current) return;
    if (!mapRef.current) {
      mapRef.current = new maps.Map(boxRef.current, {
        center: new maps.LatLng(CENTER.lat, CENTER.lng),
        level: 4,
      });
    }
    const map = mapRef.current;
    const bounds = new maps.LatLngBounds();
    const overlays = items.map((it) => {
      const pos = new maps.LatLng(it.lat, it.lng);
      bounds.extend(pos);
      const pin = document.createElement('button');
      pin.type = 'button';
      pin.title = it.name;
      pin.textContent = it.label;
      pin.className =
        'min-w-7 rounded-full border-2 border-white bg-black px-2 py-0.5 text-xs font-bold text-white shadow';
      pin.onclick = () => onSelect(it.placeId);
      const ov = new maps.CustomOverlay({ position: pos, content: pin, yAnchor: 1, clickable: true });
      ov.setMap(map);
      return ov;
    });
    if (items.length > 0) map.setBounds(bounds);
    else map.setCenter(new maps.LatLng(CENTER.lat, CENTER.lng));
    return () => overlays.forEach((o) => o.setMap(null));
  }, [ready, items, onSelect]);

  if (!KEY) {
    return (
      <div className="flex h-80 items-center justify-center rounded-lg bg-gray-100 px-6 text-center text-sm text-gray-500">
        지도 키(NEXT_PUBLIC_KAKAO_MAP_KEY)가 없어서 지도를 못 띄워요.
      </div>
    );
  }

  return (
    <>
      <Script
        id="kakao-map-sdk"
        src={`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KEY}&autoload=false`}
        // 처음 로드 + 다시 마운트될 때마다 호출된다 (목록↔지도 토글)
        onReady={() => window.kakao?.maps.load(() => setReady(true))}
        onError={() => setFailed(true)}
      />
      {failed ? (
        <div className="flex h-80 items-center justify-center rounded-lg bg-gray-100 px-6 text-center text-sm text-gray-500">
          지도를 불러오지 못했어요. 카카오 앱에 이 사이트 도메인이 등록돼 있는지 확인해 주세요.
        </div>
      ) : (
        <div ref={boxRef} className="h-[60vh] w-full overflow-hidden rounded-lg bg-gray-100" />
      )}
    </>
  );
}
