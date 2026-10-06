'use client';
// 담당 B — plan.md §10 추천 가게 지도, §1 화면 3, §5-2 n_p, §8 국캠 좌표, §9 NEXT_PUBLIC_KAKAO_MAP_KEY
import { useEffect, useRef, useState } from 'react';
import { Do_Hyeon } from 'next/font/google';
import type { Place, RecKind } from '@/lib/types';

// ---------------------------------------------------------------------------
// 카카오 지도 JS SDK — 이 파일에서 쓰는 만큼만 최소로 선언한다.
// window 전역 선언(declare global)은 하지 않는다 (다른 지도 파일의 선언과 충돌 방지)
// ---------------------------------------------------------------------------

type KakaoLatLng = { getLat(): number; getLng(): number };
type KakaoLatLngBounds = { extend(latlng: KakaoLatLng): void };
type KakaoMapInstance = {
  setBounds(
    bounds: KakaoLatLngBounds,
    paddingTop?: number,
    paddingRight?: number,
    paddingBottom?: number,
    paddingLeft?: number
  ): void;
};
type KakaoCustomOverlay = { setMap(map: KakaoMapInstance | null): void };

export type KakaoMapsSdk = {
  load(callback: () => void): void;
  LatLng: new (lat: number, lng: number) => KakaoLatLng;
  LatLngBounds: new () => KakaoLatLngBounds;
  Map: new (
    container: HTMLElement,
    options: { center: KakaoLatLng; level: number }
  ) => KakaoMapInstance;
  CustomOverlay: new (options: {
    position: KakaoLatLng;
    content: HTMLElement;
    xAnchor?: number;
    yAnchor?: number;
    zIndex?: number;
    clickable?: boolean;
  }) => KakaoCustomOverlay;
};

type WindowWithKakao = Window & { kakao?: { maps?: KakaoMapsSdk } };

/** §9 공개 가능 키(도메인 제한). NEXT_PUBLIC_은 빌드 때 그대로 박히므로 이름을 바꿔 읽지 않는다 */
const KAKAO_MAP_KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
const SDK_SRC = 'https://dapi.kakao.com/v2/maps/sdk.js';
/** 도메인 미등록 등으로 load 콜백이 영영 안 오는 경우 실패로 본다 */
const SDK_TIMEOUT_MS = 10_000;

let sdkPromise: Promise<KakaoMapsSdk> | null = null;

/**
 * 카카오 지도 SDK를 autoload=false로 한 번만 로드한다. 이미 로드됐거나 로드 중이면 그것을 재사용.
 * 실패하면 다음 호출 때 다시 시도한다. 지도 컴포넌트끼리 같이 쓰도록 export
 */
export function loadKakaoMapSdk(): Promise<KakaoMapsSdk> {
  if (typeof window === 'undefined') return Promise.reject(new Error('브라우저에서만 지도를 불러올 수 있어요.'));
  if (sdkPromise) return sdkPromise;
  if (!KAKAO_MAP_KEY) return Promise.reject(new Error('NEXT_PUBLIC_KAKAO_MAP_KEY가 없어요.'));
  const key = KAKAO_MAP_KEY;

  sdkPromise = new Promise<KakaoMapsSdk>((resolve, reject) => {
    let created: HTMLScriptElement | null = null;
    const done = (sdk: KakaoMapsSdk) => {
      window.clearTimeout(timer);
      resolve(sdk);
    };
    // 내가 넣은 태그는 지워서 다음 호출이 새로 받게 한다
    const fail = (message: string) => {
      window.clearTimeout(timer);
      created?.remove();
      reject(new Error(message));
    };
    const timer = window.setTimeout(() => fail('카카오 지도 SDK 응답 없음'), SDK_TIMEOUT_MS);
    // sdk.js만 받은 상태면 load()가 나머지를 받고 콜백, 이미 다 받았으면 바로 콜백
    const finish = () => {
      const sdk = (window as WindowWithKakao).kakao?.maps;
      if (sdk) sdk.load(() => done(sdk));
      else fail('카카오 지도 SDK를 읽지 못했어요.');
    };

    if ((window as WindowWithKakao).kakao?.maps) {
      finish();
      return;
    }
    // 다른 곳에서 넣은 SDK 태그가 아직 받는 중이면 그 태그를 기다린다
    const existing = document.querySelector<HTMLScriptElement>(`script[src^="${SDK_SRC}"]`);
    const script = existing ?? document.createElement('script');
    script.addEventListener('load', finish);
    script.addEventListener('error', () => fail('카카오 지도 SDK를 받지 못했어요.'));
    if (!existing) {
      created = script;
      script.src = `${SDK_SRC}?appkey=${encodeURIComponent(key)}&autoload=false`;
      script.async = true;
      document.head.appendChild(script);
    }
  });
  sdkPromise.catch(() => {
    sdkPromise = null;
  });
  return sdkPromise;
}

// ---------------------------------------------------------------------------
// 지도
// ---------------------------------------------------------------------------

type Recommended = { place: Place; reason: string; kind: RecKind; pickCount: number };

type RecommendMapProps = {
  recommended: Recommended[];
  myPlaces: Place[];
};

/** §8 국제캠퍼스 대략 좌표 */
const CAMPUS = { lat: 37.382, lng: 126.669 };

const KIND_LABEL: Record<RecKind, string> = { free: '무료', point: '3P', premium: '프리미엄' };

// plan.md §13 디자인 규칙 — 가게 이름·숫자는 Do Hyeon
const display = Do_Hyeon({ weight: '400', subsets: ['latin'], fallback: ['system-ui', 'sans-serif'] });
const INK = '#2A211B';

/** 꼽은 사람 수(n_p) 3단계 — 주황~빨강 한 계열, 많을수록 진하게 (§13 지도 점) */
const TIERS = [
  { label: '1명', bg: '#FFD3A1', fg: INK },
  { label: '2~3명', bg: '#FF8A3D', fg: INK },
  { label: '4명 이상', bg: '#D2301E', fg: '#ffffff' },
] as const;

function tierOf(pickCount: number): (typeof TIERS)[number] {
  if (pickCount >= 4) return TIERS[2];
  if (pickCount >= 2) return TIERS[1];
  return TIERS[0];
}

const DOT_SIZE = 28;
// 지도 위에서 점이 묻히지 않을 만큼만, 회색 대신 잉크색으로 옅게
const SELECTED_SHADOW = `0 0 0 3px ${INK}`;
const DOT_SHADOW = '0 1px 2px rgba(42,33,27,0.3)';

function recDot(r: Recommended): HTMLButtonElement {
  const tier = tierOf(r.pickCount);
  const el = document.createElement('button');
  el.type = 'button';
  el.textContent = String(r.pickCount);
  el.setAttribute('aria-label', `${r.place.name}, ${r.pickCount}명이 꼽은 곳`);
  Object.assign(el.style, {
    width: `${DOT_SIZE}px`,
    height: `${DOT_SIZE}px`,
    borderRadius: '9999px',
    border: '2px solid #ffffff',
    background: tier.bg,
    color: tier.fg,
    fontFamily: display.style.fontFamily,
    fontSize: '14px',
    fontWeight: '400',
    lineHeight: '1',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: DOT_SHADOW,
    cursor: 'pointer',
    padding: '0',
  });
  return el;
}

function myDot(name: string): HTMLDivElement {
  const el = document.createElement('div');
  el.title = `내 맛집: ${name}`;
  Object.assign(el.style, {
    width: '12px',
    height: '12px',
    borderRadius: '9999px',
    border: '2px solid #ffffff',
    background: '#9ca3af',
    boxShadow: DOT_SHADOW,
  });
  return el;
}

function campusLabel(): HTMLDivElement {
  const el = document.createElement('div');
  el.textContent = '🎓 국캠';
  Object.assign(el.style, {
    padding: '3px 8px',
    borderRadius: '9999px',
    background: INK,
    color: '#ffffff',
    fontFamily: display.style.fontFamily,
    fontSize: '12px',
    fontWeight: '400',
    whiteSpace: 'nowrap',
  });
  return el;
}

type Status = 'loading' | 'ready' | 'unavailable';

export default function RecommendMap({ recommended, myPlaces }: RecommendMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [kakao, setKakao] = useState<{ sdk: KakaoMapsSdk; map: KakaoMapInstance } | null>(null);
  const [status, setStatus] = useState<Status>(KAKAO_MAP_KEY ? 'loading' : 'unavailable');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // 점을 다시 그릴 때도 선택 표시를 유지하려고 ref에도 둔다
  const selectedRef = useRef<number | null>(null);
  const dotsRef = useRef(new Map<number, HTMLButtonElement>());

  // SDK 로드 + 지도 생성 (한 번)
  useEffect(() => {
    if (!KAKAO_MAP_KEY) return;
    let active = true;
    loadKakaoMapSdk()
      .then((sdk) => {
        if (!active || !containerRef.current) return;
        const map = new sdk.Map(containerRef.current, {
          center: new sdk.LatLng(CAMPUS.lat, CAMPUS.lng),
          level: 5,
        });
        setKakao({ sdk, map });
        setStatus('ready');
      })
      .catch((e: unknown) => {
        console.error('[RecommendMap]', e);
        if (active) setStatus('unavailable');
      });
    return () => {
      active = false;
    };
  }, []);

  // 점 그리기 + 모든 점이 보이게 범위 맞춤
  useEffect(() => {
    if (!kakao) return;
    const { sdk, map } = kakao;
    const overlays: KakaoCustomOverlay[] = [];
    const bounds = new sdk.LatLngBounds();
    const dots = dotsRef.current;
    dots.clear();

    const add = (lat: number, lng: number, content: HTMLElement, zIndex: number) => {
      const position = new sdk.LatLng(lat, lng);
      const overlay = new sdk.CustomOverlay({ position, content, zIndex, clickable: true });
      overlay.setMap(map);
      overlays.push(overlay);
      bounds.extend(position);
    };

    add(CAMPUS.lat, CAMPUS.lng, campusLabel(), 1);
    for (const p of myPlaces) add(p.lat, p.lng, myDot(p.name), 2);
    for (const r of recommended) {
      const el = recDot(r);
      if (selectedRef.current === r.place.id) el.style.boxShadow = SELECTED_SHADOW;
      el.addEventListener('click', () => {
        const prev = selectedRef.current === null ? undefined : dots.get(selectedRef.current);
        if (prev) prev.style.boxShadow = DOT_SHADOW;
        el.style.boxShadow = SELECTED_SHADOW;
        selectedRef.current = r.place.id;
        setSelectedId(r.place.id);
      });
      dots.set(r.place.id, el);
      // 꼽은 사람이 많은 점이 위로
      add(r.place.lat, r.place.lng, el, 10 + r.pickCount);
    }
    map.setBounds(bounds, 40, 32, 32, 32);

    return () => {
      for (const o of overlays) o.setMap(null);
    };
  }, [kakao, recommended, myPlaces]);

  function closeCard() {
    const prev = selectedRef.current === null ? undefined : dotsRef.current.get(selectedRef.current);
    if (prev) prev.style.boxShadow = DOT_SHADOW;
    selectedRef.current = null;
    setSelectedId(null);
  }

  if (status === 'unavailable') {
    return (
      <div className="flex h-[260px] items-center justify-center rounded-xl bg-[#F5F4F2] p-4 text-center text-sm text-[#8C6A4F] dark:bg-white/10 dark:text-[#C9AE95]">
        지도를 불러오지 못했어요. 아래 추천 목록은 그대로 볼 수 있어요.
      </div>
    );
  }

  const selected = recommended.find((r) => r.place.id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative h-[260px] overflow-hidden rounded-xl bg-[#F5F4F2] dark:bg-white/10">
        <div ref={containerRef} className="h-full w-full" />
        {status === 'loading' && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-[#8C6A4F] dark:text-[#C9AE95]">
            지도를 불러오는 중…
          </p>
        )}
      </div>

      {/* 범례: 색 3단계 = 꼽은 사람 수 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#8C6A4F] dark:text-[#C9AE95]">
        <span className="font-bold">꼽은 사람 수</span>
        {TIERS.map((t) => (
          <span key={t.label} className="flex items-center gap-1">
            <span
              className="inline-block h-3 w-3 rounded-full border border-white"
              style={{ background: t.bg }}
            />
            {t.label}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full border border-white bg-[#9ca3af]" />
          내 맛집
        </span>
      </div>

      {/* 선택한 가게: 카드로 감싸지 않고 구분선 아래 정보만 (§13 강조는 무료 추천 카드 한 곳) */}
      {selected ? (
        <div className="flex flex-col gap-1.5 border-t border-[#E7E3DE] pt-3 dark:border-white/15">
          <div className="flex items-start gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
              <span className={`${display.className} text-xl`}>{selected.place.name}</span>
              <span className="text-sm text-[#8C6A4F] dark:text-[#C9AE95]">
                {selected.place.category} · {KIND_LABEL[selected.kind]} 추천
              </span>
            </div>
            <button
              type="button"
              className="-mr-2 -mt-2 min-h-11 shrink-0 px-2 text-sm text-[#8C6A4F] dark:text-[#C9AE95]"
              onClick={closeCard}
            >
              닫기
            </button>
          </div>
          <p className="text-sm text-[#8C6A4F] dark:text-[#C9AE95]">{selected.place.address}</p>
          <p className="text-sm">&ldquo;{selected.reason}&rdquo;</p>
          <p className="text-sm">
            {selected.pickCount > 0 ? (
              <>
                <span className={`${display.className} text-base`}>{selected.pickCount}</span>명이
                꼽은 곳
              </>
            ) : (
              '아직 Top 리스트에 꼽은 사람이 없는 곳'
            )}
          </p>
          <a
            href={`https://place.map.kakao.com/${encodeURIComponent(selected.place.kakaoPlaceId)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 flex min-h-[52px] w-full items-center justify-center rounded-lg border border-[#E7E3DE] px-4 font-medium dark:border-white/20"
          >
            카카오맵에서 보기
          </a>
        </div>
      ) : (
        <p className="text-xs text-[#8C6A4F] dark:text-[#C9AE95]">점을 누르면 가게 정보를 볼 수 있어요.</p>
      )}
    </div>
  );
}
