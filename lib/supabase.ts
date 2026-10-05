// plan.md §0 — Supabase 호출은 이 브라우저 클라이언트(로그인 세션)로만 한다.
// 서버 코드(app/api/places/search)는 DB를 건드리지 않는다.
import { createClient } from '@supabase/supabase-js';

// plan.md §9 — 공개 가능한 두 변수만 쓴다. secret 키는 어디에도 넣지 않는다.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);
