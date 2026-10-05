'use client';
// 담당 A — plan.md §10 검색창 + 결과 + 선택
// 고른 가게를 그대로 넘긴다. places 행 확보는 부르는 쪽에서 lib/places.ts의 ensurePlace로 (plan.md §8)
import { useEffect, useState } from 'react';
import type { KakaoPlace } from '@/lib/types';

type PlaceSearchProps = {
  onSelect: (k: KakaoPlace) => void;
};

export default function PlaceSearch({ onSelect }: PlaceSearchProps) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<KakaoPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 입력이 멈추고 300ms 뒤 검색. 이전 요청은 취소
  useEffect(() => {
    const query = q.trim();
    if (!query) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/places/search?q=${encodeURIComponent(query)}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error();
        setResults(await res.json());
        setError(null);
      } catch {
        if (!ctrl.signal.aborted) setError('검색하지 못했어요. 잠시 후 다시 시도해 주세요.');
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q]);

  // 검색어를 지우면 이전 결과·에러는 보이지 않게
  const hasQuery = q.trim() !== '';
  const shown = hasQuery ? results : [];

  return (
    <div className="flex flex-col gap-2">
      <input
        className="rounded-lg border border-gray-300 px-3 py-2"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="🔍 가게 이름이나 메뉴로 검색"
      />
      {hasQuery && loading && <p className="text-sm text-gray-500">검색 중…</p>}
      {hasQuery && error && <p className="text-sm text-red-600">{error}</p>}
      {hasQuery && !loading && !error && shown.length === 0 && (
        <p className="text-sm text-gray-500">국캠 근처 3km 안에서 찾지 못했어요.</p>
      )}
      {shown.length > 0 && (
        <ul className="max-h-72 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
          {shown.map((k) => (
            <li key={k.kakaoPlaceId}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left hover:bg-gray-50"
                onClick={() => {
                  onSelect(k);
                  setQ('');
                }}
              >
                <div className="font-medium">{k.name}</div>
                <div className="text-xs text-gray-500">
                  {k.categoryName.split(' > ').slice(1).join(' > ')} · {k.address}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
