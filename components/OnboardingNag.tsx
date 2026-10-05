'use client';
// 담당 A — plan.md §7 Top 3 미입력자 유도 모달(앱을 열 때마다 1회)
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useUser } from '@/lib/auth';
import { getCurrentList } from '@/lib/lists';

// 페이지를 새로 열 때만 초기화된다 → 앱을 열 때마다 1회
let checked = false;

// 이 화면들에서는 띄우지 않는다
const SKIP = ['/login', '/onboarding'];

export default function OnboardingNag() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useUser();
  const [open, setOpen] = useState(false);

  const userId = user?.id;
  const skip = SKIP.includes(pathname);
  useEffect(() => {
    if (!userId || skip || checked) return;
    checked = true;
    getCurrentList(userId).then(
      (items) => {
        if (items.length === 0) setOpen(true);
      },
      () => {}
    );
  }, [userId, skip]);

  if (!open || skip) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-md rounded-t-2xl bg-white p-6 sm:rounded-2xl">
        <h2 className="text-lg font-semibold">내 맛집 Top 3를 알려주세요</h2>
        <p className="mt-2 text-sm text-gray-600">
          좋아하는 가게 3곳만 입력하면 맞춤 추천을 받을 수 있고 포인트도 쌓여요.
        </p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            className="flex-1 rounded-lg border border-gray-300 py-3 font-medium"
            onClick={() => setOpen(false)}
          >
            나중에
          </button>
          <button
            type="button"
            className="flex-1 rounded-lg bg-black py-3 font-medium text-white"
            onClick={() => {
              setOpen(false);
              router.push('/onboarding');
            }}
          >
            입력하기
          </button>
        </div>
      </div>
    </div>
  );
}
