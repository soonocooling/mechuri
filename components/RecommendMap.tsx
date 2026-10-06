'use client';
// 담당 B — plan.md §10 추천 가게 지도, §1 화면 3, §5-4 지도 규칙, §8 국캠 좌표, §9 NEXT_PUBLIC_KAKAO_MAP_KEY
// 점 모양은 docs/design-system.md §5 (순위 지도 components/KakaoMap.tsx와 같은 4단계)
import { useEffect, useRef, useState } from 'react';
import type { Place, RecKind } from '@/lib/types';
import { getAllCurrentLists } from '@/lib/lists';
import { getPlaces } from '@/lib/places';
import { computeScores, rankPlaces, rankTier, type RankTier } from '@/lib/ranking';

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

const INK = '#2A211B';
/** 내 맛집 점 · 추천 테두리와 꼬리표 (docs/design-system.md §5) */
const NAVY = '#003876';

/** 선호도 4단계 — 순위 지도(components/KakaoMap.tsx)와 같은 값 (plan.md §5-4, docs/design-system.md §5) */
const TIER_STYLE: Record<RankTier, { label: string; size: number; bg: string; fg: string; border: string }> = {
  1: { label: '상위 10%', size: 34, bg: '#D63A26', fg: '#FFFFFF', border: '2px solid #FFFFFF' },
  2: { label: '30%', size: 30, bg: '#FF8A3D', fg: INK, border: '2px solid #FFFFFF' },
  3: { label: '60%', size: 26, bg: '#FFD3A1', fg: INK, border: '2px solid #FFFFFF' },
  4: { label: '그 외', size: 22, bg: '#F3EFE8', fg: '#7A5B43', border: '1.5px solid #998878' },
};
const TIERS = [1, 2, 3, 4] as const;

const DOT_SHADOW = '0 1px 2px rgba(42,33,27,0.3)';
// 선택한 추천 점: 남색 테두리 바깥에 흰 띠 + 잉크색 고리
const SELECTED_SHADOW = `0 0 0 2px #FFFFFF, 0 0 0 4px ${INK}`;

/** 순위 탭과 같은 전체 순위·색 단계 (rankPlaces, rankTier) */
type RankInfo = { rank: number; tier: RankTier };
type Ranking = { places: Place[]; info: Map<number, RankInfo> };

function validCoord(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
}

/** 단계별 점 모양 — 순위 지도의 pinElement와 같은 크기·색·글자 크기 */
function styleDot(el: HTMLElement, tier: RankTier, label: string) {
  const t = TIER_STYLE[tier];
  // 세 자리 숫자도 점 안에 들어가게 글자를 줄인다
  const fontSize = Math.round(t.size * 0.42) - (label.length >= 3 ? 2 : 0);
  Object.assign(el.style, {
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
    boxShadow: DOT_SHADOW,
  });
}

/** 바탕 점: 현재 리스트에 들어간 가게. 누르면 간단 카드 */
function rankDot(name: string, info: RankInfo): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.title = `${name} · 전체 ${info.rank}위`;
  el.setAttribute('aria-label', `${name}, 전체 ${info.rank}위`);
  el.textContent = String(info.rank);
  styleDot(el, info.tier, el.textContent);
  el.style.cursor = 'pointer';
  return el;
}

/** 오늘의 추천 점: 단계 색 그대로 + 남색 테두리 + 위에 "추천" 꼬리표.
 *  리스트에 아무도 안 넣은 가게(순위 없음)는 4단계 색에 숫자 없이 */
function recDot(r: Recommended, info: RankInfo | undefined): HTMLButtonElement {
  const label = info ? String(info.rank) : '';
  const el = document.createElement('button');
  el.type = 'button';
  el.setAttribute(
    'aria-label',
    `${r.place.name}, 오늘의 추천${info ? `, 전체 ${info.rank}위` : ''}`
  );
  styleDot(el, info?.tier ?? 4, label);
  Object.assign(el.style, { border: `3px solid ${NAVY}`, position: 'relative', cursor: 'pointer' });

  const tag = document.createElement('span');
  tag.textContent = '추천';
  Object.assign(tag.style, {
    position: 'absolute',
    bottom: 'calc(100% + 3px)',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '2px 6px',
    borderRadius: '9999px',
    background: NAVY,
    color: '#FFFFFF',
    fontSize: '11px',
    fontWeight: '700',
    lineHeight: '1.2',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
  });
  el.append(label, tag);
  return el;
}

/** 내 맛집: 작은 남색 점. 순위 점이 있으면 그 오른쪽 위 모서리에 붙여 숫자를 가리지 않는다 */
function myMark(name: string, info: RankInfo | undefined): HTMLDivElement {
  const dot = document.createElement('div');
  dot.title = `내 맛집: ${name}`;
  Object.assign(dot.style, {
    width: '12px',
    height: '12px',
    borderRadius: '9999px',
    border: '2px solid #FFFFFF',
    background: NAVY,
    boxShadow: DOT_SHADOW,
  });
  if (!info) return dot;

  // 순위 점과 같은 크기의 투명 상자 → 오버레이 중심이 순위 점 중심과 겹친다
  const size = TIER_STYLE[info.tier].size;
  const box = document.createElement('div');
  Object.assign(box.style, { position: 'relative', width: `${size}px`, height: `${size}px`, pointerEvents: 'none' });
  Object.assign(dot.style, { position: 'absolute', top: '-4px', right: '-4px' });
  box.append(dot);
  return box;
}

function campusLabel(): HTMLDivElement {
  const el = document.createElement('div');
  el.textContent = '🎓 국캠';
  Object.assign(el.style, {
    padding: '3px 8px',
    borderRadius: '9999px',
    background: INK,
    color: '#FFFFFF',
    fontSize: '12px',
    fontWeight: '600',
    whiteSpace: 'nowrap',
  });
  return el;
}

/** 순위 탭(app/ranking)과 같은 계산: 전체 현재 리스트 → computeScores → rankPlaces → rankTier */
async function loadRanking(): Promise<Ranking> {
  const [lists, places] = await Promise.all([getAllCurrentLists(), getPlaces()]);
  const ranked = rankPlaces(computeScores(lists), places);
  const total = ranked.length;
  return {
    places: ranked.map((r) => r.place),
    info: new Map(ranked.map((r) => [r.place.id, { rank: r.rank, tier: rankTier(r.rank, total) }])),
  };
}

type Status = 'loading' | 'ready' | 'unavailable';

export default function RecommendMap({ recommended, myPlaces }: RecommendMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [kakao, setKakao] = useState<{ sdk: KakaoMapsSdk; map: KakaoMapInstance } | null>(null);
  const [status, setStatus] = useState<Status>(KAKAO_MAP_KEY ? 'loading' : 'unavailable');
  // undefined = 불러오는 중, null = 실패(바탕 점 없이 추천·내 맛집만 그린다)
  const [ranking, setRanking] = useState<Ranking | null | undefined>(undefined);
  // 아래 카드: 추천 점(사유 포함) 또는 바탕 점(간단 카드)
  const [card, setCard] = useState<{ kind: 'rec' | 'place'; id: number } | null>(null);
  // 강조 고리가 걸린 추천 점. 바탕 점을 눌러도 그대로 두고, 점을 다시 그릴 때도 유지하려고 ref로 둔다
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

  // 전체 순위 (한 번)
  useEffect(() => {
    let active = true;
    loadRanking()
      .then((r) => {
        if (active) setRanking(r);
      })
      .catch((e: unknown) => {
        console.error('[RecommendMap] 순위', e);
        if (active) setRanking(null);
      });
    return () => {
      active = false;
    };
  }, []);

  // 점 그리기 + 국캠·내 맛집·추천이 보이게 범위 맞춤 (바탕 점은 범위에 넣지 않는다)
  useEffect(() => {
    if (!kakao || ranking === undefined) return;
    const { sdk, map } = kakao;
    const overlays: KakaoCustomOverlay[] = [];
    const bounds = new sdk.LatLngBounds();
    const dots = dotsRef.current;
    dots.clear();
    const info = ranking?.info ?? new Map<number, RankInfo>();

    const add = (lat: number, lng: number, content: HTMLElement, zIndex: number, fit: boolean) => {
      if (!validCoord(lat, lng)) return;
      const position = new sdk.LatLng(lat, lng);
      const overlay = new sdk.CustomOverlay({ position, content, zIndex, clickable: true });
      overlay.setMap(map);
      overlays.push(overlay);
      if (fit) bounds.extend(position);
    };

    add(CAMPUS.lat, CAMPUS.lng, campusLabel(), 1, true);

    // 바탕: 현재 리스트에 들어간 전체 가게, 진한 단계가 위. 추천 가게는 아래에서 추천 점으로 그린다
    const recIds = new Set(recommended.map((r) => r.place.id));
    for (const p of ranking?.places ?? []) {
      const i = info.get(p.id);
      if (!i || recIds.has(p.id)) continue;
      const el = rankDot(p.name, i);
      el.addEventListener('click', () => setCard({ kind: 'place', id: p.id }));
      add(p.lat, p.lng, el, 10 - i.tier, false);
    }

    for (const p of myPlaces) add(p.lat, p.lng, myMark(p.name, info.get(p.id)), 20, true);

    // 오늘의 추천: 가장 위
    for (const r of recommended) {
      const el = recDot(r, info.get(r.place.id));
      if (selectedRef.current === r.place.id) el.style.boxShadow = SELECTED_SHADOW;
      el.addEventListener('click', () => {
        const prev = selectedRef.current === null ? undefined : dots.get(selectedRef.current);
        if (prev) prev.style.boxShadow = DOT_SHADOW;
        el.style.boxShadow = SELECTED_SHADOW;
        selectedRef.current = r.place.id;
        setCard({ kind: 'rec', id: r.place.id });
      });
      dots.set(r.place.id, el);
      add(r.place.lat, r.place.lng, el, 30, true);
    }
    map.setBounds(bounds, 40, 32, 32, 32);

    return () => {
      for (const o of overlays) o.setMap(null);
    };
  }, [kakao, ranking, recommended, myPlaces]);

  // 추천 카드를 닫을 때만 강조 고리도 지운다 (바탕 카드는 추천 강조와 무관)
  function closeCard() {
    if (card?.kind === 'rec') {
      const prev = selectedRef.current === null ? undefined : dotsRef.current.get(selectedRef.current);
      if (prev) prev.style.boxShadow = DOT_SHADOW;
      selectedRef.current = null;
    }
    setCard(null);
  }

  if (status === 'unavailable') {
    return (
      <div className="flex h-[260px] items-center justify-center rounded-xl bg-[#F5F4F2] p-4 text-center text-sm text-[#8C6A4F] dark:bg-white/10 dark:text-[#C9AE95]">
        지도를 불러오지 못했어요. 아래 추천 목록은 그대로 볼 수 있어요.
      </div>
    );
  }

  const selected = card?.kind === 'rec' ? (recommended.find((r) => r.place.id === card.id) ?? null) : null;
  const picked = card?.kind === 'place' ? (ranking?.places.find((p) => p.id === card.id) ?? null) : null;
  const cardPlace = selected?.place ?? picked;
  const cardRank = cardPlace ? ranking?.info.get(cardPlace.id)?.rank : undefined;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative h-[260px] overflow-hidden rounded-xl bg-[#F5F4F2] dark:bg-white/10">
        <div ref={containerRef} className="h-full w-full" />
        {(status === 'loading' || ranking === undefined) && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-[#8C6A4F] dark:text-[#C9AE95]">
            지도를 불러오는 중…
          </p>
        )}
      </div>

      {/* 범례: 전체 순위 기준 선호도 4단계 + 내 맛집 + 추천 (순위 지도와 같은 단계) */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#8C6A4F] dark:text-[#C9AE95]">
        <span className="font-bold">선호도</span>
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
        <span className="flex items-center gap-1">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full border border-white"
            style={{ background: NAVY }}
          />
          내 맛집
        </span>
        <span className="flex items-center gap-1">
          <span
            className="inline-block rounded-full px-1.5 text-[10px] font-bold leading-4 text-white"
            style={{ background: NAVY }}
          >
            추천
          </span>
        </span>
      </div>

      {/* 선택한 가게: 카드로 감싸지 않고 구분선 아래 정보만 (docs/design-system.md §4 강조는 무료 추천 카드 한 곳)
          추천 점 → 사유·꼽은 사람 수까지, 바탕 점 → 이름 · "{대분류} · 전체 n위" · 카카오맵 링크만 */}
      {cardPlace ? (
        <div className="flex flex-col gap-1.5 border-t border-[#E7E3DE] pt-3 dark:border-white/15">
          <div className="flex items-start gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
              <span className="text-xl font-semibold">{cardPlace.name}</span>
              <span className="text-sm text-[#8C6A4F] dark:text-[#C9AE95]">
                {cardPlace.category}
                {selected ? ` · ${KIND_LABEL[selected.kind]} 추천` : ''}
                {cardRank ? ` · 전체 ${cardRank}위` : ''}
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
          {selected && (
            <>
              <p className="text-sm text-[#8C6A4F] dark:text-[#C9AE95]">{selected.place.address}</p>
              <p className="text-sm">&ldquo;{selected.reason}&rdquo;</p>
              <p className="text-sm">
                {selected.pickCount > 0 ? (
                  <>
                    <span className="font-semibold">{selected.pickCount}</span>명이 꼽은 곳
                  </>
                ) : (
                  '아직 Top 리스트에 꼽은 사람이 없는 곳'
                )}
              </p>
            </>
          )}
          <a
            href={`https://place.map.kakao.com/${encodeURIComponent(cardPlace.kakaoPlaceId)}`}
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
