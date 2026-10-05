'use client';
// 담당 A — plan.md §10 하단 탭
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/ranking', label: '순위' },
  { href: '/recommend', label: '추천' },
  { href: '/my-list', label: '내 맛집' },
  { href: '/me', label: '마이' },
];

export default function BottomTabs() {
  const pathname = usePathname();

  return (
    <nav className="sticky bottom-0 grid grid-cols-4 border-t border-black/10 bg-[var(--background)] dark:border-white/15">
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
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
