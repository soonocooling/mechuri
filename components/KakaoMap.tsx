'use client';
// 담당 C — plan.md §10 지도 (여유 있을 때, plan.md §11 우선순위 3)
// 키는 NEXT_PUBLIC_KAKAO_MAP_KEY (공개 가능, 도메인 제한)
// → 키 주인의 카카오 앱 Web 플랫폼에 http://localhost:3000, Vercel 도메인이 등록돼 있어야 지도가 뜬다.
// SDK는 추천 지도와 같은 loadKakaoMapSdk()로 한 번만 받는다.
import { useEffect, useRef, useState } from 'react';
import { loadKakaoMapSdk, type KakaoMapsSdk } from '@/components/RecommendMap';
import type { RankTier } from '@/lib/ranking';

export type MapItem = {
  placeId: number;
  name: string;
  lat: number;
  lng: number;
  /** 점 안 숫자 (전체 순위) */
  label: string;
  /** 전체 순위 기준 색 단계 (rankTier) */
  tier: RankTier;
};

type KakaoMapProps = {
  /** 핀을 찍을 가게 (좌표가 이상한 건 여기서 건너뛴다) */
  items: MapItem[];
  onSelect: (placeId: number) => void;
};

// 국제캠퍼스 대략 좌표 (plan.md §8과 같은 값)
const CENTER = { lat: 37.382, lng: 126.669 };
const KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;

// loadKakaoMapSdk가 주는 타입에 이 파일에서 더 쓰는 메서드만 덧붙인다
type LatLng = InstanceType<KakaoMapsSdk['LatLng']>;
type KMap = InstanceType<KakaoMapsSdk['Map']> & { setCenter(p: LatLng): void; relayout(): void };

/** 선호도 4단계 — 진할수록 상위 */
const TIER_STYLE: Record<RankTier, { label: string; size: number; bg: string; fg: string; border: string }> = {
  1: { label: '상위 10%', size: 34, bg: '#D63A26', fg: '#FFFFFF', border: '2px solid #FFFFFF' },
  2: { label: '30%', size: 30, bg: '#FF8A3D', fg: '#2A211B', border: '2px solid #FFFFFF' },
  3: { label: '60%', size: 26, bg: '#FFD3A1', fg: '#2A211B', border: '2px solid #FFFFFF' },
  4: { label: '그 외', size: 22, bg: '#F3EFE8', fg: '#7A5B43', border: '1.5px solid #998878' },
};
const TIERS = [1, 2, 3, 4] as const;

function validCoord(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

function pinElement(it: MapItem, onSelect: (placeId: number) => void): HTMLButtonElement {
  const t = TIER_STYLE[it.tier];
  const pin = document.createElement('button');
  pin.type = 'button';
  pin.title = it.name;
  pin.textContent = it.label;
  pin.setAttribute('aria-label', `${it.name}, 전체 ${it.label}위`);
  // 세 자리 숫자도 점 안에 들어가게 글자를 줄인다
  const fontSize = Math.round(t.size * 0.42) - (it.label.length >= 3 ? 2 : 0);
  Object.assign(pin.style, {
    width: `${t.size}px`,
    height: `${t.size}px`,
    borderRadius: '9999px',
    border: t.border,
    background: t.bg,
    color: t.fg,
    fontSize: `${fontSize}px`,
    fontWeight: '700',
    lineHeight: '1',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0',
    boxShadow: '0 1px 2px rgba(42,33,27,0.3)',
    cursor: 'pointer',
  });
  pin.onclick = () => onSelect(it.placeId);
  return pin;
}

export default function KakaoMap({ items, onSelect }: KakaoMapProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [kakao, setKakao] = useState<{ sdk: KakaoMapsSdk; map: KMap } | null>(null);
  const [failed, setFailed] = useState(false);

  // SDK 로드 + 지도 생성 (마운트마다 한 번, SDK 자체는 한 번만 받는다)
  useEffect(() => {
    if (!KEY) return;
    let active = true;
    loadKakaoMapSdk()
      .then((sdk) => {
        if (!active || !boxRef.current) return;
        const map = new sdk.Map(boxRef.current, {
          center: new sdk.LatLng(CENTER.lat, CENTER.lng),
          level: 4,
        }) as KMap;
        // 목록↔지도 토글 직후 컨테이너 크기를 다시 읽게 한다
        map.relayout();
        setKakao({ sdk, map });
      })
      .catch((e: unknown) => {
        console.error('[KakaoMap]', e);
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  // 핀 갱신 + 모든 핀이 보이게 범위 맞춤
  useEffect(() => {
    if (!kakao) return;
    const { sdk, map } = kakao;
    const bounds = new sdk.LatLngBounds();
    let count = 0;
    const overlays = items
      .filter((it) => validCoord(it.lat, it.lng))
      .map((it) => {
        const position = new sdk.LatLng(it.lat, it.lng);
        bounds.extend(position);
        count++;
        const ov = new sdk.CustomOverlay({
          position,
          content: pinElement(it, onSelect),
          // 진한 단계가 위에
          zIndex: 10 - it.tier,
          clickable: true,
        });
        ov.setMap(map);
        return ov;
      });
    if (count > 0) map.setBounds(bounds, 40, 32, 32, 32);
    else map.setCenter(new sdk.LatLng(CENTER.lat, CENTER.lng));
    return () => overlays.forEach((o) => o.setMap(null));
  }, [kakao, items, onSelect]);

  if (!KEY) {
    return (
      <div className="flex h-80 items-center justify-center rounded-lg bg-gray-100 px-6 text-center text-sm text-gray-500">
        지도 키(NEXT_PUBLIC_KAKAO_MAP_KEY)가 없어서 지도를 못 띄워요.
      </div>
    );
  }

  if (failed) {
    return (
      <div className="flex h-80 items-center justify-center rounded-lg bg-gray-100 px-6 text-center text-sm text-gray-500">
        지도를 불러오지 못했어요. 카카오 앱에 이 사이트 도메인이 등록돼 있는지 확인해 주세요.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative h-[60vh] w-full overflow-hidden rounded-lg bg-gray-100">
        <div ref={boxRef} className="h-full w-full" />
        {!kakao && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">
            지도 불러오는 중…
          </p>
        )}
      </div>

      {/* 범례: 전체 순위 기준 선호도 4단계 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
        <span className="font-semibold">선호도</span>
        {TIERS.map((tier) => {
          const t = TIER_STYLE[tier];
          return (
            <span key={tier} className="flex items-center gap-1">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ background: t.bg, border: tier === 4 ? t.border : '1px solid #FFFFFF' }}
              />
              {t.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
