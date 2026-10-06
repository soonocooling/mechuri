'use client';
// 담당 C — plan.md §10 가게 상세 시트 (화면 2)
// 데이터는 순위 탭이 이미 불러온 것(RankingView)을 받아 쓴다 → 상세를 열 때 DB를 다시 읽지 않는다.
// 리뷰·리스트 저장 후에는 onChanged로 순위 탭에 다시 불러오라고 알린다.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CurrentReview, Place, ReviewSource, Tag } from '@/lib/types';
import type { RankedPlace } from '@/lib/ranking';
import { breakdownForPlace } from '@/lib/tagStats';
import { useUser } from '@/lib/auth';
import { getCurrentList, saveList } from '@/lib/lists';
import ReviewSheet from '@/components/ReviewSheet';

/** 순위 탭이 한 번 불러와 계산해 둔 것 */
export type RankingView = {
  places: Map<number, Place>;
  ranked: RankedPlace[];
  newcomers: RankedPlace[];
  stats: Map<number, { assignedTagIds: number[]; positive: string[] }>;
  reviews: CurrentReview[];
  tags: Tag[];
};

type PlaceDetailProps = {
  placeId: number;
  view: RankingView;
  onClose: () => void;
  /** 리뷰 제출·내 맛집 추가 후 호출 → 순위 탭이 데이터를 다시 불러온다 */
  onChanged: () => void;
};

const MAX_LIST = 10;
/** 평가형 분포 막대는 응답 3개 이상일 때만 (기획서 F-19) */
const MIN_EVAL_RESPONSES = 3;

export default function PlaceDetail({ placeId, view, onClose, onChanged }: PlaceDetailProps) {
  const router = useRouter();
  const { user } = useUser();
  const [reviewing, setReviewing] = useState<ReviewSource | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const place = view.places.get(placeId);
  if (!place) return null;

  const row =
    view.ranked.find((r) => r.place.id === placeId) ??
    view.newcomers.find((r) => r.place.id === placeId);
  const placeReviews = view.reviews.filter((r) => r.placeId === placeId);
  const groups = breakdownForPlace(placeId, placeReviews, view.tags);
  const assigned = view.stats.get(placeId)?.assignedTagIds ?? [];
  const tagById = new Map(view.tags.map((t) => [t.id, t]));
  const descriptive = groups.filter((g) => g.groupKind === 'descriptive');
  const evaluative = groups.filter((g) => g.groupKind === 'evaluative' && g.n > 0);
  const isTestPlace = place.kakaoPlaceId.startsWith('test-');

  // 카테고리 안 순위 (n ≥ 2만)
  const inCategory = view.ranked.filter((r) => r.place.category === place.category);
  const categoryRank = row?.rank ? inCategory.findIndex((r) => r.place.id === placeId) + 1 : null;

  function requireLogin(): string | null {
    if (user) return user.id;
    router.push('/login');
    return null;
  }

  async function addToMyList() {
    const userId = requireLogin();
    if (!userId || busy) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const current = await getCurrentList(userId);
      if (current.length === 0) {
        // save_list는 3곳 미만을 거부한다 → 첫 리스트는 온보딩에서
        router.push('/onboarding');
        return;
      }
      if (current.some((i) => i.placeId === placeId)) {
        setNotice('이미 내 맛집에 있어요.');
        return;
      }
      if (current.length >= MAX_LIST) {
        setError(`내 맛집은 ${MAX_LIST}곳까지예요. 내 맛집 탭에서 하나 빼고 추가해 주세요.`);
        return;
      }
      const ids = [...current].sort((a, b) => a.rank - b.rank).map((i) => i.placeId);
      await saveList([...ids, placeId], false);
      setNotice(`내 맛집 ${ids.length + 1}위로 추가했어요.`);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : '추가하지 못했어요.');
    } finally {
      setBusy(false);
    }
  }

  function openReview(source: ReviewSource) {
    if (!requireLogin()) return;
    setNotice(null);
    setError(null);
    setReviewing(source);
  }

  function reviewDone(earned: number) {
    setReviewing(null);
    setNotice(earned > 0 ? `리뷰 고마워요! +${earned}P` : '리뷰를 남겼어요.');
    onChanged();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-label={`${place.name} 상세`}
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {reviewing ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{place.name} 어땠어?</h2>
              <button type="button" className="text-sm text-gray-500" onClick={() => setReviewing(null)}>
                취소
              </button>
            </div>
            <ReviewSheet
              placeId={place.id}
              placeCategory={place.category}
              source={reviewing}
              embedded
              onDone={reviewDone}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="truncate text-xl font-semibold">{place.name}</h2>
                <p className="text-sm text-gray-500">
                  {place.category}
                  {row?.rank ? ` · 전체 ${row.rank}위` : ' · 신규 발견'}
                  {categoryRank ? ` · ${place.category} ${categoryRank}위` : ''}
                </p>
              </div>
              <button type="button" aria-label="닫기" className="px-1 text-gray-400" onClick={onClose}>
                ✕
              </button>
            </div>

            {row && (
              <p className="text-sm">
                <b>{row.n}명</b>이 꼽음 · 1위로 꼽은 사람 {row.nFirst}명
              </p>
            )}

            {assigned.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {assigned.map((id) => (
                  <span key={id} className="rounded-full bg-gray-100 px-2 py-0.5 text-sm">
                    #{tagById.get(id)?.label}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">아직 확실하게 붙은 태그가 없어요.</p>
            )}

            {placeReviews.length < 3 && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                정보가 더 필요해요 · 리뷰 {placeReviews.length}개
              </p>
            )}

            {/* 서술형: 칩별 선택 비율 (붙은 태그 판정 근거) */}
            {descriptive.some((g) => g.n > 0) && (
              <details className="text-sm">
                <summary className="cursor-pointer text-gray-600">태그 자세히 보기</summary>
                <div className="mt-2 flex flex-col gap-2">
                  {descriptive
                    .filter((g) => g.n > 0)
                    .map((g) => (
                      <div key={g.groupKey}>
                        <span className="text-gray-500">{g.groupLabel}</span>{' '}
                        {g.chips
                          .filter((c) => c.k > 0)
                          .sort((a, b) => b.k - a.k)
                          .map((c) => `${c.label} ${c.k}/${g.n}`)
                          .join(' · ')}
                      </div>
                    ))}
                </div>
              </details>
            )}

            {/* 평가형: 3단 분포 */}
            <div className="flex flex-col gap-2">
              {evaluative.map((g) => {
                const [plus, zero, minus] = [1, 0, -1].map(
                  (v) => g.chips.find((c) => c.value === v)?.k ?? 0
                );
                return (
                  <div key={g.groupKey} className="flex items-center gap-2 text-sm">
                    <span className="w-12 shrink-0 text-gray-600">{g.groupLabel}</span>
                    {g.n >= MIN_EVAL_RESPONSES ? (
                      <>
                        <div className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                          <div className="bg-emerald-500" style={{ width: `${(plus / g.n) * 100}%` }} />
                          <div className="bg-gray-300" style={{ width: `${(zero / g.n) * 100}%` }} />
                          <div className="bg-rose-300" style={{ width: `${(minus / g.n) * 100}%` }} />
                        </div>
                        <span className="w-24 shrink-0 text-right text-xs text-gray-500">
                          {g.chips.find((c) => c.value === 1)?.label} {plus}/{g.n}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-gray-400">응답 {g.n}개 · 3개부터 보여요</span>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="text-xs text-gray-500">{place.address}</p>

            {notice && <p className="text-sm text-green-700">{notice}</p>}
            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex flex-col gap-2">
              <button
                type="button"
                className="rounded-lg bg-black py-3 font-medium text-white"
                onClick={() => openReview('review')}
              >
                간단 리뷰 남기기
              </button>
              <button
                type="button"
                className="rounded-lg border border-gray-300 py-3 font-medium disabled:opacity-40"
                disabled={busy}
                onClick={addToMyList}
              >
                {busy ? '추가하는 중…' : '내 맛집에 추가'}
              </button>
              {!isTestPlace && (
                <a
                  href={`https://place.map.kakao.com/${place.kakaoPlaceId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="py-2 text-center text-sm text-gray-600 underline"
                >
                  카카오맵에서 보기
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
