'use client';
// 담당 C — plan.md §10 모의 결제 (plan.md §5-7). 실제 결제 없음, 카드 입력란 없음
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUser } from '@/lib/auth';
import { buyPremium, getPremiumUntil, PREMIUM_DAYS, PREMIUM_PRICE } from '@/lib/premium';

const fmtDate = (d: Date) => `${d.getMonth() + 1}월 ${d.getDate()}일`;

export default function PremiumPage() {
  const router = useRouter();
  const { user, loading } = useUser();
  const [until, setUntil] = useState<Date | null | undefined>(undefined); // undefined = 불러오는 중
  const [step, setStep] = useState<'info' | 'confirm' | 'done'>('info');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userId = user?.id;
  useEffect(() => {
    if (loading) return;
    if (!userId) {
      router.replace('/login');
      return;
    }
    getPremiumUntil(userId).then(setUntil, () => setUntil(null));
  }, [loading, userId, router]);

  async function pay() {
    if (!userId || busy) return;
    setError(null);
    setBusy(true);
    try {
      await buyPremium();
      setUntil(await getPremiumUntil(userId));
      setStep('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : '결제를 처리하지 못했어요.');
    } finally {
      setBusy(false);
    }
  }

  if (loading || !user || until === undefined) return null;

  const beta = <p className="text-center text-xs text-gray-400">베타 기간 동안 실제 결제는 이루어지지 않습니다.</p>;

  if (step === 'done') {
    return (
      <div className="flex flex-col items-center gap-4 pt-16 text-center">
        <div className="text-4xl">🎉</div>
        <h1 className="text-xl font-semibold">결제가 완료되었습니다</h1>
        <p className="text-sm text-gray-600">
          프리미엄 활성화 ({PREMIUM_DAYS}일{until ? ` · ${fmtDate(until)}까지` : ''})
        </p>
        <button
          type="button"
          className="w-full rounded-lg bg-black py-3 font-medium text-white"
          onClick={() => router.push('/recommend')}
        >
          추천 5곳 받으러 가기
        </button>
        {beta}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-semibold">메추리 프리미엄</h1>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-500">
            <th className="py-2 text-left font-normal" />
            <th className="py-2 font-normal">무료</th>
            <th className="py-2 font-semibold text-black">프리미엄</th>
          </tr>
        </thead>
        <tbody className="text-center">
          <tr className="border-t border-gray-100">
            <td className="py-2 text-left text-gray-600">추천 개수</td>
            <td>1곳</td>
            <td className="font-semibold">5곳</td>
          </tr>
          <tr className="border-t border-gray-100">
            <td className="py-2 text-left text-gray-600">추천 횟수</td>
            <td>하루 1회</td>
            <td className="font-semibold">무제한</td>
          </tr>
          <tr className="border-t border-gray-100">
            <td className="py-2 text-left text-gray-600">다시 추천</td>
            <td>3P</td>
            <td className="font-semibold">무료</td>
          </tr>
        </tbody>
      </table>

      {until ? (
        <div className="flex flex-col gap-3">
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            프리미엄 사용 중 · {fmtDate(until)}까지
          </p>
          <Link href="/recommend" className="rounded-lg bg-black py-3 text-center font-medium text-white">
            추천 받으러 가기
          </Link>
        </div>
      ) : step === 'info' ? (
        <button
          type="button"
          className="rounded-lg bg-black py-3 font-medium text-white"
          onClick={() => setStep('confirm')}
        >
          월 {PREMIUM_PRICE.toLocaleString()}원 · 구독하기
        </button>
      ) : (
        <div className="flex flex-col gap-3 rounded-xl border border-gray-200 p-4">
          <h2 className="font-semibold">결제 확인</h2>
          <dl className="grid grid-cols-[5rem_1fr] gap-y-1 text-sm">
            <dt className="text-gray-500">상품</dt>
            <dd>메추리 프리미엄</dd>
            <dt className="text-gray-500">가격</dt>
            <dd>{PREMIUM_PRICE.toLocaleString()}원</dd>
            <dt className="text-gray-500">기간</dt>
            <dd>{PREMIUM_DAYS}일</dd>
          </dl>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              className="flex-1 rounded-lg border border-gray-300 py-3 font-medium"
              onClick={() => setStep('info')}
              disabled={busy}
            >
              취소
            </button>
            <button
              type="button"
              className="flex-[2] rounded-lg bg-black py-3 font-medium text-white disabled:opacity-40"
              onClick={pay}
              disabled={busy}
            >
              {busy ? '결제 중…' : '결제하기'}
            </button>
          </div>
        </div>
      )}
      {beta}
    </div>
  );
}
