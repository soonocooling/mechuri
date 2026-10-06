// 담당 B — plan.md §10, §5-6 추천
import type { Category, Place, RecItem, RecKind } from './types';
import { supabase } from './supabase';
import { getAllCurrentLists } from './lists';
import { getPlaces } from './places';
import { getTags } from './tags';
import { getCurrentReviews } from './reviews';
import { computeScores } from './ranking';
import { computeTagStats } from './tagStats';

/** 세 항(CF·CB·POP)이 모두 0이라 기여 최대 항을 정할 수 없을 때의 사유 */
export const FALLBACK_REASON = '아직 정보가 적어 골라본 새로운 곳';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const EPS = 1e-9;

/** CB 벡터 블록 가중치 (§5-6). 태그 블록은 group_key로 찾고, 나머지 그룹은 쓰지 않는다 */
const CATEGORY_WEIGHT = 0.3;
const TAG_GROUP_WEIGHT: Record<string, number> = {
  cuisine: 0.15,
  taste: 0.2,
  mood: 0.15,
  situation: 0.2,
};

type Scores = ReturnType<typeof computeScores>;

/** w(r) = 1 / log₂(r + 1) (§5-2) */
function w(rank: number): number {
  return 1 / Math.log2(rank + 1);
}

/** 목적격 조사: 받침 있으면 '을', 없으면 '를'. 마지막 글자가 한글이 아니면 '을(를)' */
function objectParticle(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return '을(를)';
  return code % 28 === 0 ? '를' : '을';
}

// ---------------------------------------------------------------------------
// 주 단위 (월 00:00 KST)
// ---------------------------------------------------------------------------

/** KST 기준 월요일부터 지난 일수 (월 0 … 일 6) */
function daysSinceMondayKst(now: Date): number {
  const kst = new Date(now.getTime() + KST_OFFSET_MS); // UTC 필드 = KST 벽시계
  return (kst.getUTCDay() + 6) % 7;
}

/** 이번 주 시작(월 00:00 KST) 시각 */
function weekStartKst(now: Date): Date {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const monday = Date.UTC(
    kst.getUTCFullYear(),
    kst.getUTCMonth(),
    kst.getUTCDate() - daysSinceMondayKst(now)
  );
  return new Date(monday - KST_OFFSET_MS);
}

/** 다음 무료 추천(다음 월 00:00 KST)까지 남은 날짜 수. 월요일 7 … 일요일 1 */
export function daysUntilNextFree(now: Date = new Date()): number {
  return 7 - daysSinceMondayKst(now);
}

// ---------------------------------------------------------------------------
// recommendations 읽기·쓰기
// ---------------------------------------------------------------------------

/** result_json `[{"place_id":3,"reason":"..."}]` → RecItem[]. 모양이 틀린 항목은 버린다 */
function parseResult(json: string): RecItem[] {
  try {
    const raw: unknown = JSON.parse(json);
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (r): r is { place_id: number; reason: string } =>
          typeof r?.place_id === 'number' && typeof r?.reason === 'string'
      )
      .map((r) => ({ placeId: r.place_id, reason: r.reason }));
  } catch {
    return [];
  }
}

/** 이번 주(월 00:00 KST~) free 결과를 읽기만 한다. 기록이 없으면 null (저장하지 않음) */
export async function getThisWeekFree(userId: string): Promise<RecItem[] | null> {
  const { data, error } = await supabase
    .from('recommendations')
    .select('result_json')
    .eq('user_id', userId)
    .eq('kind', 'free')
    .gte('created_at', weekStartKst(new Date()).toISOString())
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .returns<{ result_json: string }[]>();
  if (error) throw new Error(error.message);
  return data.length ? parseResult(data[0].result_json) : null;
}

async function saveResult(userId: string, kind: RecKind, items: RecItem[]): Promise<void> {
  const resultJson = JSON.stringify(items.map((i) => ({ place_id: i.placeId, reason: i.reason })));
  const { error } = await supabase
    .from('recommendations')
    .insert({ user_id: userId, kind, result_json: resultJson });
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// CB 벡터 (키 → 값, 0인 칸은 비움)
// ---------------------------------------------------------------------------

type Vec = Map<string, number>;

/** x(p) = [0.30·onehot(category) ‖ 0.15·cuisine ‖ 0.20·taste ‖ 0.15·mood ‖ 0.20·situation] */
function placeVector(
  category: Category | undefined,
  tagIds: number[],
  tagWeight: Map<number, number>
): Vec {
  const v: Vec = new Map();
  if (category) v.set(`c:${category}`, CATEGORY_WEIGHT);
  for (const id of tagIds) {
    const weight = tagWeight.get(id);
    if (weight) v.set(`t:${id}`, weight);
  }
  return v;
}

function addScaled(target: Vec, v: Vec, s: number): void {
  for (const [key, x] of v) target.set(key, (target.get(key) ?? 0) + s * x);
}

function dot(a: Vec, b: Vec): number {
  let sum = 0;
  for (const [key, x] of a) sum += x * (b.get(key) ?? 0);
  return sum;
}

function cosine(a: Vec, b: Vec): number {
  const d = Math.sqrt(dot(a, a)) * Math.sqrt(dot(b, b));
  return d > 0 ? dot(a, b) / d : 0;
}

// ---------------------------------------------------------------------------
// 계산 (§5-6)
// ---------------------------------------------------------------------------

/** §5-2 동점 규칙: n_p ↓ → 1위 표 수 ↓ → 이름 ↑. computeScores가 비어 있으면 이름만 남는다 */
function compareTie(a: number, b: number, scores: Scores, places: Map<number, Place>): number {
  const sa = scores.get(a);
  const sb = scores.get(b);
  const n = (sb?.n ?? 0) - (sa?.n ?? 0);
  if (n !== 0) return n;
  const first = (sb?.nFirst ?? 0) - (sa?.nFirst ?? 0);
  if (first !== 0) return first;
  return (places.get(a)?.name ?? '').localeCompare(places.get(b)?.name ?? '', 'ko');
}

/** 순위 탭과 같은 기준(n_p ≥ 2만, S̃ ↓, §5-2 동점 규칙)의 순위. key = placeId */
function rankPositions(scores: Scores, places: Map<number, Place>): Map<number, number> {
  const ids = [...scores].filter(([, s]) => s.n >= 2).map(([id]) => id);
  ids.sort((a, b) => {
    const d = scores.get(b)!.score - scores.get(a)!.score;
    return Math.abs(d) > EPS ? d : compareTie(a, b, scores, places);
  });
  return new Map(ids.map((id, i) => [id, i + 1]));
}

/** 후보를 점수순으로 count곳 고르고 사유를 붙인다. 저장은 하지 않는다 */
async function computeRecommendations(
  userId: string,
  count: number,
  excludeIds: number[] = []
): Promise<RecItem[]> {
  const [lists, reviews, tags, places] = await Promise.all([
    getAllCurrentLists(),
    getCurrentReviews(),
    getTags(),
    getPlaces(),
  ]);
  const myList = lists.get(userId) ?? [];
  const mine = new Set(myList.map((i) => i.placeId));
  const excluded = new Set(excludeIds);

  // 후보: 현재 리스트·현재 리뷰에 등장한 가게 − 내 현재 리스트 − excludeIds
  const seen = new Set<number>();
  for (const items of lists.values()) for (const i of items) seen.add(i.placeId);
  for (const r of reviews) seen.add(r.placeId);
  const candidates = [...seen].filter((id) => !mine.has(id) && !excluded.has(id) && places.has(id));
  if (candidates.length === 0) return [];

  // C 함수 결과. 아직 빈 Map이면 해당 값은 아래에서 0으로 흡수된다
  const scores = computeScores(lists);
  const tagStats = computeTagStats(reviews, tags);

  // CF: U_p = p를 현재 리스트에 넣은 사용자 집합
  const usersOf = new Map<number, Set<string>>();
  for (const [uid, items] of lists) {
    for (const i of items) {
      if (!usersOf.has(i.placeId)) usersOf.set(i.placeId, new Set());
      usersOf.get(i.placeId)!.add(uid);
    }
  }
  const sim = (p: number, q: number): number => {
    const up = usersOf.get(p);
    const uq = usersOf.get(q);
    if (!up || !uq) return 0;
    let both = 0;
    for (const u of up) if (uq.has(u)) both++;
    return both / Math.sqrt(up.size * uq.size);
  };
  const cfRaw = new Map<number, number>();
  for (const p of candidates) {
    cfRaw.set(p, myList.reduce((sum, q) => sum + w(q.rank) * sim(p, q.placeId), 0));
  }
  const cfMax = Math.max(0, ...cfRaw.values());

  // α = min(1, k/20), k = 내 리스트와 1곳 이상 겹치는 다른 사용자 수
  let k = 0;
  for (const [uid, items] of lists) {
    if (uid !== userId && items.some((i) => mine.has(i.placeId))) k++;
  }
  const alpha = Math.min(1, k / 20);

  // CB: 내 취향 c = Σ w(r(q))·x̃(q). 내 현재 리뷰가 있으면 태그 부분을 내 선택으로
  const tagWeight = new Map<number, number>();
  for (const t of tags) {
    const weight = TAG_GROUP_WEIGHT[t.groupKey];
    if (weight) tagWeight.set(t.id, weight);
  }
  const myTags = new Map(
    reviews.filter((r) => r.userId === userId).map((r) => [r.placeId, r.tagIds])
  );
  const assigned = (p: number): number[] => tagStats.get(p)?.assignedTagIds ?? [];
  const taste: Vec = new Map();
  for (const q of myList) {
    const tagIds = myTags.get(q.placeId) ?? assigned(q.placeId);
    addScaled(taste, placeVector(places.get(q.placeId)?.category, tagIds, tagWeight), w(q.rank));
  }

  // POP = S̃ / max S̃
  const popMax = Math.max(0, ...[...scores.values()].map((s) => s.score));

  const scored = candidates.map((p) => {
    const x = placeVector(places.get(p)?.category, assigned(p), tagWeight);
    const cf = cfMax > 0 ? (cfRaw.get(p) ?? 0) / cfMax : 0;
    const cb = cosine(taste, x);
    const pop = popMax > 0 ? (scores.get(p)?.score ?? 0) / popMax : 0;
    const terms = { cf: alpha * cf, cb: (1 - alpha) * 0.6 * cb, pop: (1 - alpha) * 0.4 * pop };
    return { p, x, terms, score: terms.cf + terms.cb + terms.pop };
  });
  scored.sort((a, b) => {
    const d = b.score - a.score;
    return Math.abs(d) > EPS ? d : compareTie(a.p, b.p, scores, places);
  });

  const positions = rankPositions(scores, places);
  const tagLabel = new Map(tags.map((t) => [t.id, t.label]));
  const myFirst = myList.find((i) => i.rank === 1) ?? myList[0];

  // 사유: 세 항 중 기여 최대 항 (동률이면 CF → CB → POP 순)
  const reasonFor = ({ p, x, terms }: (typeof scored)[number]): string => {
    const best = Math.max(terms.cf, terms.cb, terms.pop);
    if (best <= EPS) return FALLBACK_REASON;

    if (terms.cf === best) {
      // 내 1위 가게가 p와 겹치지 않으면, 가장 크게 기여한 내 가게 이름을 쓴다
      let q = myFirst;
      if (!q || sim(p, q.placeId) === 0) {
        q = myList.reduce((a, b) =>
          w(b.rank) * sim(p, b.placeId) > w(a.rank) * sim(p, a.placeId) ? b : a
        );
      }
      const name = places.get(q.placeId)?.name ?? '내 맛집';
      return `${name}${objectParticle(name)} 꼽은 사람들이 많이 꼽은 곳`;
    }

    if (terms.cb >= terms.pop) {
      // 일치하는 태그를 내 취향 기여가 큰 순으로 1~2개. 태그가 없으면 대분류로
      const matched = [...x]
        .filter(([key]) => key.startsWith('t:') && (taste.get(key) ?? 0) > 0)
        .sort(([ka, va], [kb, vb]) => (taste.get(kb) ?? 0) * vb - (taste.get(ka) ?? 0) * va)
        .slice(0, 2)
        .map(([key]) => `#${tagLabel.get(Number(key.slice(2)))}`);
      const category = places.get(p)?.category;
      const label = matched.length ? matched.join(' ') : `#${category}`;
      return `${label} 취향과 맞음`;
    }

    const position = positions.get(p);
    return position ? `국캠 전체 ${position}위` : '신규 발견';
  };

  return scored.slice(0, count).map((s) => ({ placeId: s.p, reason: reasonFor(s) }));
}

/** score = α·CF + (1−α)·(0.6·CB + 0.4·POP) (plan.md §5-6).
 *  insert와 이번 주 free 결과 재사용도 여기서 한다. 결과가 0곳이면 insert하지 않는다 */
export async function recommend(
  userId: string,
  kind: RecKind,
  excludeIds?: number[]
): Promise<RecItem[]> {
  if (kind === 'free') {
    const saved = await getThisWeekFree(userId);
    if (saved) return saved;
    const items = await computeRecommendations(userId, 1);
    if (items.length > 0) await saveResult(userId, 'free', items);
    return items;
  }

  // TODO(B4) point: getPointBalance(userId) ≥ 3 확인 → computeRecommendations(userId, 1)
  //   → 1곳 이상이면 saveResult(userId, 'point', items). 요청 중 버튼 비활성은 화면에서
  // TODO(B5) premium: hasPremium(userId) 확인 → computeRecommendations(userId, 5, excludeIds)
  //   → 1곳 이상이면 saveResult(userId, 'premium', items)
  void excludeIds;
  throw new Error('아직 준비 중인 추천이에요.');
}
