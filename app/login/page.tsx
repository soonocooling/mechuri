'use client';
// 담당 A — plan.md §10 로그인·가입 (화면 1)
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn, signUp } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'signup' | 'signin' | null>(null);

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

  return (
    <div className="flex flex-col gap-6 pt-12">
      <h1 className="text-3xl font-bold">메추리</h1>

      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          run('signin');
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="text-sm text-gray-600">아이디</span>
          <input
            className="rounded-lg border border-gray-300 px-3 py-2"
            value={id}
            onChange={(e) => setId(e.target.value.toLowerCase())}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={20}
            placeholder="영문 소문자·숫자·밑줄 4~20자"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-gray-600">비밀번호</span>
          <input
            className="rounded-lg border border-gray-300 px-3 py-2"
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoComplete="current-password"
            placeholder="8자 이상"
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            className="flex-1 rounded-lg border border-gray-300 py-2 font-medium disabled:opacity-50"
            disabled={busy !== null}
            onClick={() => run('signup')}
          >
            {busy === 'signup' ? '가입 중…' : '가입'}
          </button>
          <button
            type="submit"
            className="flex-1 rounded-lg bg-black py-2 font-medium text-white disabled:opacity-50"
            disabled={busy !== null}
          >
            {busy === 'signin' ? '로그인 중…' : '로그인'}
          </button>
        </div>
      </form>
    </div>
  );
}
