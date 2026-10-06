'use client';
// 담당 A — plan.md §10 하단 탭
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useUser } from '@/lib/auth';

const TABS = [
  { href: '/ranking', label: '순위', public: true },
  { href: '/recommend', label: '추천', public: false },
  { href: '/my-list', label: '내 맛집', public: false },
  { href: '/me', label: '마이', public: false },
];

// 시작 화면(로그인·온보딩)에서는 탭을 숨긴다 (plan.md §1 화면 1)
const HIDDEN = ['/', '/login', '/onboarding'];

export default function BottomTabs() {
  const pathname = usePathname();
  const { user, loading } = useUser();
  if (HIDDEN.includes(pathname)) return null;

  return (
    <nav className="sticky bottom-0 grid grid-cols-4 border-t border-black/10 bg-[var(--background)] dark:border-white/15">
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        // 비로그인이면 순위 외 탭은 로그인으로
        const href = !tab.public && !loading && !user ? '/login' : tab.href;
        return (
          <Link
            key={tab.href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`py-3 text-center text-sm ${active ? 'font-semibold' : 'opacity-60'}`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
