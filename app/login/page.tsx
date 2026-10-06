'use client';
// 담당 A — plan.md §10 로그인·가입 (화면 1). 화면 디자인은 B(순오 승인)
import { Suspense, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Jua } from 'next/font/google';
import { signIn, signUp, useUser } from '@/lib/auth';

const jua = Jua({ weight: '400', preload: false, fallback: ['system-ui', 'sans-serif'] });

type Mode = 'signup' | 'signin';

const TABS: { mode: Mode; label: string }[] = [
  { mode: 'signin', label: '로그인' },
  { mode: 'signup', label: '가입' },
];

const INPUT =
  'mt-2 h-[52px] w-full rounded-[14px] border-[1.5px] border-[#998878] bg-white px-4 text-[16px] text-[#2A211B] outline-none focus:border-[#003876] focus:ring-2 focus:ring-[#003876]/20';
const HINT = 'mt-1.5 text-[12px] text-[#7A5B43]';

// ?mode=signup을 읽는 useSearchParams는 배포 빌드에서 Suspense 안에 있어야 한다
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginScreen />
    </Suspense>
  );
}

function LoginScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>(searchParams.get('mode') === 'signup' ? 'signup' : 'signin');
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'signup' | 'signin' | null>(null);
  const { user, loading } = useUser();

  // 이미 로그인한 채로 들어오면 순위로. 가입·로그인 진행 중에는 그쪽 이동을 따른다
  useEffect(() => {
    if (!loading && user && busy === null) router.replace('/ranking');
  }, [loading, user, busy, router]);

  async function run(kind: 'signup' | 'signin') {
    setError(null);
    setBusy(kind);
    try {
      if (kind === 'signup') {
        await signUp(id, pw);
        router.replace('/onboarding');
      } else {
        await signIn(id, pw);
        router.replace('/ranking');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '잠시 후 다시 시도해 주세요.');
      setBusy(null);
    }
  }

  const signup = mode === 'signup';

  return (
    <div className="-mx-4 -my-4 flex min-h-dvh justify-center bg-white text-[#2A211B]">
      <div className="w-full max-w-[430px] px-6 pt-3 pb-10">
        <Link
          href="/"
          aria-label="첫 화면으로"
          className="-ml-2.5 flex size-11 items-center justify-center rounded-full"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </Link>

        <div className="mt-4 flex items-center gap-3">
          <Image src="/brand/mechuri-mascot.svg" alt="" width={72} height={72} loading="eager" unoptimized />
          <div>
            <h1 className={`${jua.className} text-[36px] leading-none text-[#003876]`}>메추리</h1>
            <p className="mt-1.5 text-[14px] text-[#7A5B43]">
              {signup ? '아이디 하나로 바로 시작해요' : '다시 와서 반가워요'}
            </p>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-1 rounded-[14px] bg-[#F3EFE8] p-1">
          {TABS.map((tab) => {
            const selected = mode === tab.mode;
            return (
              <button
                key={tab.mode}
                type="button"
                aria-pressed={selected}
                disabled={busy !== null}
                onClick={() => {
                  setMode(tab.mode);
                  setError(null);
                }}
                className={`h-11 rounded-[10px] text-[15px] font-semibold ${
                  selected ? 'bg-[#003876] text-white' : 'text-[#2A211B]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <form
          className="mt-6 flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            run(mode);
          }}
        >
          <label className="block">
            <span className="text-[14px] font-semibold">아이디</span>
            <input
              className={INPUT}
              value={id}
              onChange={(e) => setId(e.target.value.toLowerCase())}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={20}
              aria-describedby={signup ? 'id-hint' : undefined}
            />
            {signup && (
              <p id="id-hint" className={HINT}>
                영문 소문자, 숫자, 밑줄로 4~20자
              </p>
            )}
          </label>
          <label className="block">
            <span className="text-[14px] font-semibold">비밀번호</span>
            <input
              className={INPUT}
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              autoComplete={signup ? 'new-password' : 'current-password'}
              aria-describedby={signup ? 'pw-hint' : undefined}
            />
            {signup && (
              <p id="pw-hint" className={HINT}>
                8자 이상
              </p>
            )}
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            className="h-[54px] w-full rounded-[14px] bg-[#D63A26] text-[16px] font-bold text-white disabled:opacity-50"
            disabled={busy !== null}
          >
            {busy === 'signup' ? '가입 중…' : busy === 'signin' ? '로그인 중…' : signup ? '가입하기' : '로그인'}
          </button>

          {signup && (
            <p className="rounded-[14px] bg-[#F3EFE8] px-4 py-3 text-[13px] leading-5">
              학교 메일 없이 아이디만으로 가입해요. 비밀번호 찾기는 아직 없으니 잊지 않게 따로 적어 두세요.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
