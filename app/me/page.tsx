'use client';
// 담당 C — plan.md §10 마이 (아이디·포인트·프리미엄)
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signOut, useUser } from '@/lib/auth';
import { getPointBalance } from '@/lib/points';
import { getPremiumUntil } from '@/lib/premium';

const fmtDate = (d: Date) => `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;

export default function MePage() {
  const router = useRouter();
  const { user, loading } = useUser();
  const [points, setPoints] = useState<number | null>(null);
  const [until, setUntil] = useState<Date | null | undefined>(undefined);

  const userId = user?.id;
  useEffect(() => {
    if (loading) return;
    if (!userId) {
      router.replace('/login');
      return;
    }
    getPointBalance(userId).then(setPoints, () => setPoints(null));
    getPremiumUntil(userId).then(setUntil, () => setUntil(null));
  }, [loading, userId, router]);

  async function logout() {
    await signOut();
    router.replace('/ranking');
  }

  if (loading || !user) return null;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">마이</h1>

      <div className="rounded-xl border border-gray-200 p-4">
        <div className="text-sm text-gray-500">아이디</div>
        <div className="text-lg font-semibold">{user.username}</div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-gray-200 p-4">
          <div className="text-sm text-gray-500">포인트</div>
          <div className="text-lg font-semibold">{points === null ? '–' : `${points}P`}</div>
        </div>
        <div className="rounded-xl border border-gray-200 p-4">
          <div className="text-sm text-gray-500">멤버십</div>
          <div className="text-lg font-semibold">
            {until === undefined ? '–' : until ? '프리미엄' : '무료'}
          </div>
          {until && <div className="text-xs text-gray-500">{fmtDate(until)}까지</div>}
        </div>
      </div>

      {until === null && (
        <Link href="/premium" className="rounded-lg bg-black py-3 text-center font-medium text-white">
          프리미엄으로 추천 5곳 받기
        </Link>
      )}

      <nav className="flex flex-col divide-y divide-gray-100 rounded-xl border border-gray-200">
        <Link href="/my-list" className="px-4 py-3">
          내 맛집 편집
        </Link>
        <Link href="/premium" className="px-4 py-3">
          프리미엄
        </Link>
        <button type="button" className="px-4 py-3 text-left text-gray-500" onClick={logout}>
          로그아웃
        </button>
      </nav>
    </div>
  );
}
