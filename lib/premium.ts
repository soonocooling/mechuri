// 담당 C — plan.md §10, §5-7 프리미엄 (유료 여부 판정은 이 파일 한 곳에서만)

/** 뼈대: 더미값. 본인 subscriptions 중 period_end > now() 가 있으면 true */
export async function hasPremium(userId: string): Promise<boolean> {
  return false;
}

/** 뼈대: 더미. subscriptions 한 줄 추가(amount = 1900), 실제 결제 없음 */
export async function buyPremium(): Promise<void> {}
