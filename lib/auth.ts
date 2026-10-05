'use client';
// 담당 A — plan.md §7 인증 (아이디 → 이메일 변환)
import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';

const EMAIL_DOMAIN = 'users.mechuri.app';
const ID_RULE = /^[a-z0-9_]{4,20}$/;

/** 아이디를 소문자로 바꾸고 규칙 검사 → `아이디@users.mechuri.app` (plan.md §7) */
function toEmail(id: string): string {
  const username = id.trim().toLowerCase();
  if (!ID_RULE.test(username)) {
    throw new Error('아이디는 4~20자 영문 소문자·숫자·밑줄만 쓸 수 있어요.');
  }
  return `${username}@${EMAIL_DOMAIN}`;
}

function checkPassword(pw: string): void {
  if (pw.length < 8) throw new Error('비밀번호는 8자 이상이어야 해요.');
}

/** 화면에 표시하는 아이디 = 이메일의 @ 앞부분 (plan.md §7) */
function toAppUser(u: User | null | undefined): { id: string; username: string } | null {
  if (!u) return null;
  return { id: u.id, username: (u.email ?? '').split('@')[0] };
}

export async function signUp(id: string, pw: string): Promise<void> {
  const email = toEmail(id);
  checkPassword(pw);
  const { data, error } = await supabase.auth.signUp({ email, password: pw });
  if (error) {
    if (error.code === 'user_already_exists' || /already registered/i.test(error.message)) {
      throw new Error('이미 사용 중인 아이디예요.');
    }
    throw new Error(error.message);
  }
  // Confirm email이 켜져 있으면 세션이 없다 (plan.md §7 — 대시보드에서 꺼야 함)
  if (!data.session) {
    throw new Error('가입은 됐지만 로그인 세션이 없어요. Supabase에서 Confirm email을 꺼주세요.');
  }
}

export async function signIn(id: string, pw: string): Promise<void> {
  const email = toEmail(id);
  checkPassword(pw);
  const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
  if (error) {
    if (error.code === 'invalid_credentials' || /invalid login credentials/i.test(error.message)) {
      throw new Error('아이디 또는 비밀번호가 맞지 않아요.');
    }
    throw new Error(error.message);
  }
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

export function useUser(): { user: { id: string; username: string } | null; loading: boolean } {
  const [user, setUser] = useState<{ id: string; username: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setUser(toAppUser(data.session?.user));
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(toAppUser(session?.user));
      setLoading(false);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { user, loading };
}
