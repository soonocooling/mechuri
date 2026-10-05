'use client';
// 담당 A — plan.md §7 인증 (아이디 → 이메일 변환)

/** 뼈대: 더미. 아이디 `soono` → `soono@users.mechuri.app` (plan.md §7) */
export async function signUp(id: string, pw: string): Promise<void> {}

/** 뼈대: 더미 */
export async function signIn(id: string, pw: string): Promise<void> {}

/** 뼈대: 더미 */
export async function signOut(): Promise<void> {}

/** 뼈대: 더미값. 표시 아이디 = 이메일의 @ 앞부분 (plan.md §7) */
export function useUser(): { user: { id: string; username: string } | null; loading: boolean } {
  return { user: null, loading: false };
}
