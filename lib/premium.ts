// 담당 C — plan.md §10, §5-7 프리미엄 (유료 여부 판정은 이 파일 한 곳에서만)
import { supabase } from './supabase';

/** 표시 가격(원). 실제 결제 없음 (plan.md §5-7) */
export const PREMIUM_PRICE = 1900;
/** 표시용 기간(일). 실제 만료일은 DB 기본값 period_end = now() + 30일 */
export const PREMIUM_DAYS = 30;

/** 본인 subscriptions 중 아직 안 끝난 것의 가장 늦은 period_end. 없으면 null.
 *  화면 표시(마이 탭 “○월 ○일까지”)용. 유료 여부 판정은 반드시 hasPremium으로 한다. */
export async function getPremiumUntil(userId: string): Promise<Date | null> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('period_end')
    .eq('user_id', userId)
    .gt('period_end', new Date().toISOString())
    .order('period_end', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return data && data.length > 0 ? new Date(data[0].period_end as string) : null;
}

/** 본인 subscriptions 중 period_end > now() 가 하나라도 있으면 true (plan.md §5-7)
 *  RLS상 본인 행만 읽히므로 userId는 로그인 사용자 id를 넣는다. */
export async function hasPremium(userId: string): Promise<boolean> {
  return (await getPremiumUntil(userId)) !== null;
}

/** 모의 결제: subscriptions 한 줄 추가(amount = 1900). user_id·period_end는 DB 기본값
 *  (auth.uid(), now() + 30일). 로그인 안 돼 있으면 RLS가 막아서 에러를 던진다. */
export async function buyPremium(): Promise<void> {
  const { error } = await supabase.from('subscriptions').insert({ amount: PREMIUM_PRICE });
  if (error) throw new Error(error.message);
}
