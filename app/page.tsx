'use client';
// 담당 A — plan.md §1 화면 1 시작 화면 (화면 디자인은 B, 순오 승인)
import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Jua } from 'next/font/google';
import { useUser } from '@/lib/auth';
import { mealNow } from '@/components/EggHatch';

const jua = Jua({ weight: '400', preload: false, fallback: ['system-ui', 'sans-serif'] });

// 그림 영역 342×320 기준 좌표를 %로 바꿔 좁은 화면에서는 같은 비율로 줄인다
const ART_W = 342;
const ART_H = 320;
const pctX = (px: number) => `${(px / ART_W) * 100}%`;
const pctY = (px: number) => `${(px / ART_H) * 100}%`;

// 메추리알 반점 (알 220×280 안의 위치·지름 px)
const EGG_W = 220;
const EGG_H = 280;
const SPOTS = [
  { x: 54, y: 52, d: 26, color: '#7A5B43' },
  { x: 128, y: 40, d: 14, color: '#2A211B' },
  { x: 160, y: 96, d: 30, color: '#7A5B43' },
  { x: 98, y: 120, d: 12, color: '#2A211B' },
  { x: 186, y: 168, d: 16, color: '#2A211B' },
  { x: 132, y: 196, d: 22, color: '#7A5B43' },
  { x: 176, y: 236, d: 10, color: '#7A5B43' },
];

export default function StartPage() {
  const router = useRouter();
  const { user, loading } = useUser();
  const [meal, setMeal] = useState(() => mealNow());

  // 화면을 켜 둔 사이 끼니가 바뀌면 문구도 바뀐다
  useEffect(() => {
    const timer = setInterval(() => setMeal(mealNow()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // 이미 로그인했으면 시작 화면 없이 순위로
  useEffect(() => {
    if (!loading && user) router.replace('/ranking');
  }, [loading, user, router]);

  if (loading || user) return null;

  return (
    <div className="-mx-4 -my-4 flex min-h-dvh justify-center bg-white text-[#2A211B]">
      <div className="flex w-full max-w-[430px] flex-col px-6 pt-11 pb-[72px]">
        <div className="min-h-6 flex-1" aria-hidden="true" />

        <div className="flex flex-col items-center text-center">
          <div className="relative aspect-[342/320] w-full max-w-[342px]">
            <div
              className="absolute overflow-hidden rounded-[50%_50%_50%_50%/60%_60%_40%_40%] bg-[#F3EFE8]"
              style={{ left: pctX(118), top: 0, width: pctX(EGG_W), height: pctY(EGG_H) }}
              aria-hidden="true"
            >
              {SPOTS.map((s) => (
                <span
                  key={`${s.x}-${s.y}`}
                  className="absolute rounded-full"
                  style={{
                    left: `${(s.x / EGG_W) * 100}%`,
                    top: `${(s.y / EGG_H) * 100}%`,
                    width: `${(s.d / EGG_W) * 100}%`,
                    height: `${(s.d / EGG_H) * 100}%`,
                    backgroundColor: s.color,
                  }}
                />
              ))}
            </div>
            <Image
              src="/brand/mechuri-mascot.svg"
              alt="과잠을 입은 메추리"
              width={210}
              height={210}
              loading="eager"
              unoptimized
              className="absolute"
              style={{ left: pctX(6), top: pctY(110), width: pctX(210), height: pctY(210) }}
            />
          </div>

          <h1 className={`${jua.className} mt-6 text-[72px] leading-none tracking-[-1px] text-[#003876]`}>
            메추리
          </h1>
          <p className="mt-4 text-[18px] leading-[27px]">
            메추리가 낳은 알에
            <br />
            오늘의 {meal} 메뉴가 들어 있어요
          </p>
          <p className="mt-3 text-[16px] leading-6 text-[#7A5B43]">
            국캠 학생들이 직접 꼽은 맛집 순위로,
            <br />내 입맛에 맞는 곳을 찾아요.
          </p>
        </div>

        <div className="min-h-6 flex-1" aria-hidden="true" />

        <Link
          href="/login?mode=signup"
          className="flex h-[74px] w-full items-center justify-center rounded-[14px] bg-[#D63A26] text-[20px] font-bold text-white"
        >
          시작하기
        </Link>
      </div>
    </div>
  );
}
