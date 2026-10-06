// 담당 B — plan.md §10, §5-6 추천
import type { Category, CurrentReview, Place, RecItem, RecKind, Tag } from './types';
import { supabase } from './supabase';
import { getAllCurrentLists } from './lists';
import { getPlaces } from './places';
import { getTags } from './tags';
import { getCurrentReviews } from './reviews';
import { getPointBalance } from './points';
import { hasPremium } from './premium';
import { computeScores, rankPlaces } from './ranking';
import { breakdownForPlace, computeTagStats, EVALUATIVE_THRESHOLD } from './tagStats';

/** 세 항(CF·CB·POP)이 모두 0이라 기여 최대 항을 정할 수 없을 때의 사유 */
export const FALLBACK_REASON = '아직 정보가 적어 골라본 새로운 곳';

/** 포인트 추천 1회 비용 (§5-5) */
const POINT_COST = 3;

/** recommend()가 던지는 사용자용 에러 문구 */
export const NOT_ENOUGH_POINTS_MESSAGE = `포인트가 부족해요. 추천 한 번에 ${POINT_COST}P가 필요해요.`;
export const PREMIUM_REQUIRED_MESSAGE = '프리미엄 회원만 이용할 수 있어요.';
export const LOAD_FAILED_MESSAGE = '추천을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.';

const USER_MESSAGES = new Set([
  NOT_ENOUGH_POINTS_MESSAGE,
  PREMIUM_REQUIRED_MESSAGE,
  LOAD_FAILED_MESSAGE,
]);

/** 원문은 콘솔에만 남기고, 화면에는 사용자용 문구를 던진다 */
function loadFailed(cause: unknown): Error {
  console.error('[recommend]', cause);
  return new Error(LOAD_FAILED_MESSAGE);
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const KST_OFFSET_MS = 9 * HOUR_MS;
/** 하루 경계: 06:00 KST */
const DAY_START_HOUR_MS = 6 * HOUR_MS;
/** free·point 반복 방지 기간 */
const REPEAT_WINDOW_MS = 7 * DAY_MS;
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

// ---------------------------------------------------------------------------
// 지금 상태 조건 (§5-6 "지금 상태 조건", 화면은 components/MoodPicker.tsx)
// ---------------------------------------------------------------------------

/** 땡기는 거의 대분류 칩 (places.category 12종에서 기타 제외) */
export const CRAVING_CATEGORIES: Category[] = [
  '한식', '중식', '일식', '양식', '아시안', '분식',
  '치킨', '버거·피자', '샐러드·건강식', '카페·디저트', '술집',
];

export const HUNGER_OPTIONS = ['출출해요', '배고파요', '엄청 배고파요'] as const;
export const COMPANY_OPTIONS = ['혼자', '둘이', '여럿', '술자리'] as const;
export const BUDGET_OPTIONS = ['가볍게', '보통', '제대로'] as const;
export type Hunger = (typeof HUNGER_OPTIONS)[number];
export type Company = (typeof COMPANY_OPTIONS)[number];
export type Budget = (typeof BUDGET_OPTIONS)[number];

/** 배 상태 기본값. 이것만 골랐으면 조건이 없는 것으로 본다 */
export const DEFAULT_HUNGER: Hunger = '배고파요';

/** 땡기는 거 최대 개수: 무료·포인트(hasPremium false) 1개, 프리미엄 3개 */
export const FREE_CRAVINGS = 1;
export const PREMIUM_CRAVINGS = 3;

/** 지금 상태 조건. 모든 칸이 선택 사항이고, 비어 있으면 조건 없는 추천과 같다 */
export type RecContext = {
  /** 땡기는 거: 대분류 */
  categories?: Category[];
  /** 땡기는 거: taste 칩 label */
  tastes?: string[];
  hunger?: Hunger;
  company?: Company;
  budget?: Budget;
  /** 바로 먹고 싶어요 */
  quick?: boolean;
};

/** 선택지 하나가 연결되는 태그(tags의 group_key·label)와 대분류 */
type MoodLink = { tags: { group: string; label: string }[]; categories: Category[] };

const link = (tags: [group: string, label: string][], categories: Category[] = []): MoodLink => ({
  tags: tags.map(([group, label]) => ({ group, label })),
  categories,
});

/** 질문 선택지 → 실제 태그 연결표 (§5-6 표). label은 schema.sql tags 시드 그대로 */
export const MOOD_TAG_MAP: {
  hunger: Record<Hunger, MoodLink>;
  company: Record<Company, MoodLink>;
  budget: Record<Budget, MoodLink>;
  quick: MoodLink;
} = {
  hunger: {
    출출해요: link([['portion', '적음'], ['portion', '보통']], ['분식', '카페·디저트']),
    배고파요: link([]),
    '엄청 배고파요': link([['portion', '푸짐'], ['value', '좋음']]),
  },
  company: {
    혼자: link([['situation', '혼밥']]),
    둘이: link([['situation', '밥약']]),
    여럿: link([['situation', '단체·회식']]),
    술자리: link([['situation', '술자리']]),
  },
  // price 칩 sort 1·2·3 순서
  budget: {
    가볍게: link([['price', '1인 1만 원 이하']]),
    보통: link([['price', '1~2만 원']]),
    제대로: link([['price', '2만 원 이상']]),
  },
  quick: link([['wait', '바로 입장']]),
};

/** T의 원소 하나: 태그 또는 대분류. label은 사유에 쓰는 이름 */
type Want =
  | { key: string; label: string; tag: Tag }
  | { key: string; label: string; category: Category };

function findTag(tags: Tag[], group: string, label: string): Tag | undefined {
  return tags.find((t) => t.groupKey === group && t.label === label);
}

function tagWant(tag: Tag): Want {
  // 평가형은 '좋음'·'보통'만으로는 뜻이 없어 그룹 이름을 붙인다 ("양 푸짐")
  const label = tag.groupKind === 'evaluative' ? `${tag.groupLabel} ${tag.label}` : tag.label;
  return { key: `t:${tag.id}`, label, tag };
}

/** 연결표 한 칸 → T 원소. 태그 데이터에 없는 label은 빠진다 */
function resolveLink(tags: Tag[], l: MoodLink): Want[] {
  const wants: Want[] = l.tags.flatMap(({ group, label }) => {
    const tag = findTag(tags, group, label);
    return tag ? [tagWant(tag)] : [];
  });
  for (const category of l.categories) wants.push({ key: `c:${category}`, label: category, category });
  return wants;
}

/** 화면에 보여줄 선택지. 연결되는 태그·대분류가 하나도 없는 선택지는 뺀다 */
export type MoodOptions = {
  tastes: string[];
  hunger: Hunger[];
  company: Company[];
  budget: Budget[];
  quick: boolean;
};

export function moodOptions(tags: Tag[]): MoodOptions {
  const usable = (l: MoodLink) => resolveLink(tags, l).length > 0;
  return {
    tastes: tags.filter((t) => t.groupKey === 'taste').map((t) => t.label),
    hunger: HUNGER_OPTIONS.filter((h) => h === DEFAULT_HUNGER || usable(MOOD_TAG_MAP.hunger[h])),
    company: COMPANY_OPTIONS.filter((c) => usable(MOOD_TAG_MAP.company[c])),
    budget: BUDGET_OPTIONS.filter((b) => usable(MOOD_TAG_MAP.budget[b])),
    quick: usable(MOOD_TAG_MAP.quick),
  };
}

/** 조건이 하나라도 있는지 (배고파요는 조건 아님) */
export function hasConditions(c: RecContext): boolean {
  return (
    (c.categories?.length ?? 0) > 0 ||
    (c.tastes?.length ?? 0) > 0 ||
    (c.hunger !== undefined && c.hunger !== DEFAULT_HUNGER) ||
    c.company !== undefined ||
    c.budget !== undefined ||
    c.quick === true
  );
}

/** 무료 선(땡기는 거 1개)을 넘는 조건이 있는지 */
function exceedsFree(c: RecContext): boolean {
  const cravings = (c.categories?.length ?? 0) + (c.tastes?.length ?? 0);
  return cravings > FREE_CRAVINGS || hasConditions({ ...c, categories: [], tastes: [] });
}

/** 무료·유료 선에 맞게 자른다. 땡기는 거는 대분류 → 맛 순으로 앞에서부터 남긴다 */
function scopeContext(c: RecContext, premium: boolean): RecContext {
  const max = premium ? PREMIUM_CRAVINGS : FREE_CRAVINGS;
  const categories = (c.categories ?? []).slice(0, max);
  const tastes = (c.tastes ?? []).slice(0, max - categories.length);
  if (!premium) return { categories, tastes };
  return { ...c, categories, tastes };
}

/** 요청 태그 집합 T. 질문 순서(땡기는 거 → 배 상태 → 누구랑 → 예산·시간), 겹치는 원소는 한 번만 */
function resolveWants(c: RecContext, tags: Tag[]): Want[] {
  const wants: Want[] = [];
  for (const label of c.tastes ?? []) {
    const tag = findTag(tags, 'taste', label);
    if (tag) wants.push(tagWant(tag));
  }
  if (c.hunger) wants.push(...resolveLink(tags, MOOD_TAG_MAP.hunger[c.hunger]));
  if (c.company) wants.push(...resolveLink(tags, MOOD_TAG_MAP.company[c.company]));
  if (c.budget) wants.push(...resolveLink(tags, MOOD_TAG_MAP.budget[c.budget]));
  if (c.quick) wants.push(...resolveLink(tags, MOOD_TAG_MAP.quick));
  const seen = new Set<string>();
  return wants.filter((x) => !seen.has(x.key) && seen.add(x.key));
}

/** 대분류 제한을 풀었을 때 결과에 붙는 안내 */
export const RELAXED_NOTICE = '조건에 딱 맞는 곳이 없어 가까운 곳을 골랐어요';

/** recommend() 결과. notice = 대분류 제한을 풀었을 때 안내 (저장하지 않는다) */
export type RecResult = RecItem[] & { notice?: string };

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
// 하루 단위 (06:00 KST 경계). 새벽 0~6시는 전날에 속한다
// ---------------------------------------------------------------------------

/** 오늘 시작(가장 최근 06:00 KST) 시각 */
function dayStartKst(now: Date): Date {
  // 06:00 KST를 UTC 자정으로 옮기면 날짜 내림만 하면 된다
  const shifted = new Date(now.getTime() + KST_OFFSET_MS - DAY_START_HOUR_MS);
  const start = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  return new Date(start - KST_OFFSET_MS + DAY_START_HOUR_MS);
}

/** 다음 무료 추천(다음 06:00 KST)까지 남은 시간(ms). 6시간 이하면 같은 날짜 아침 6시 */
export function msUntilNextFree(now: Date = new Date()): number {
  return dayStartKst(now).getTime() + DAY_MS - now.getTime();
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

/** 오늘(06:00 KST~) free 결과를 읽기만 한다. 기록이 없으면 null (저장하지 않음) */
export async function getTodayFree(userId: string): Promise<RecItem[] | null> {
  const { data, error } = await supabase
    .from('recommendations')
    .select('result_json')
    .eq('user_id', userId)
    .eq('kind', 'free')
    .gte('created_at', dayStartKst(new Date()).toISOString())
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .returns<{ result_json: string }[]>();
  if (error) throw loadFailed(error);
  return data.length ? parseResult(data[0].result_json) : null;
}

/** 최근 7일 안에 내가 kinds 추천으로 받은 가게 id */
async function getRecentPlaceIds(userId: string, kinds: RecKind[]): Promise<number[]> {
  const since = new Date(Date.now() - REPEAT_WINDOW_MS);
  const { data, error } = await supabase
    .from('recommendations')
    .select('result_json')
    .eq('user_id', userId)
    .in('kind', kinds)
    .gte('created_at', since.toISOString())
    .returns<{ result_json: string }[]>();
  if (error) throw loadFailed(error);
  return data.flatMap((row) => parseResult(row.result_json).map((i) => i.placeId));
}

async function saveResult(userId: string, kind: RecKind, items: RecItem[]): Promise<void> {
  const resultJson = JSON.stringify(items.map((i) => ({ place_id: i.placeId, reason: i.reason })));
  const { error } = await supabase
    .from('recommendations')
    .insert({ user_id: userId, kind, result_json: resultJson });
  if (error) throw loadFailed(error);
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

/** 순위 탭과 같은 전체 순위(n_p ≥ 1 모든 가게, S̃ ↓, S̃가 같으면 공동 순위). key = placeId */
function rankPositions(scores: Scores, places: Map<number, Place>): Map<number, number> {
  return new Map(rankPlaces(scores, places).map((r) => [r.place.id, r.rank]));
}

/** 평가형 칩 중 그 칩 응답의 LB ≥ 0.40인 tag id (+1 칩이면 §5-3 긍정 통과와 같다) */
function evaluativePassed(placeId: number, reviews: CurrentReview[], tags: Tag[]): Set<number> {
  const passed = new Set<number>();
  for (const g of breakdownForPlace(placeId, reviews, tags)) {
    if (g.groupKind !== 'evaluative' || g.n === 0) continue;
    for (const c of g.chips) if (c.lb >= EVALUATIVE_THRESHOLD) passed.add(c.tagId);
  }
  return passed;
}

/**
 * 후보를 점수순으로 count곳 고르고 사유를 붙인다. 저장은 하지 않는다.
 * excludeIds는 항상 빼고, softExcludeIds는 빼서 후보가 0곳이 되면 다시 넣는다 (빈 알보다 반복이 낫다).
 * context가 있으면 대분류 제한과 ctx를 반영한다(§5-6 지금 상태 조건). relaxed = 대분류 제한을 풀었음
 */
async function computeRecommendations(
  userId: string,
  count: number,
  excludeIds: number[] = [],
  softExcludeIds: number[] = [],
  context: RecContext = {}
): Promise<{ items: RecItem[]; relaxed: boolean }> {
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
  const allowed = [...seen].filter((id) => !mine.has(id) && !excluded.has(id) && places.has(id));
  const soft = new Set(softExcludeIds);
  const withoutRepeats = (ids: number[]) => {
    const fresh = ids.filter((id) => !soft.has(id));
    return fresh.length > 0 ? fresh : ids;
  };
  // 땡기는 거 대분류: 그 대분류 안에서 고르고(반복 제외 → 해제), 그래도 0곳이면 대분류 제한만 푼다
  const wantCategories = new Set(context.categories ?? []);
  let candidates = withoutRepeats(
    allowed.filter((id) => wantCategories.has(places.get(id)!.category))
  );
  const relaxed = wantCategories.size > 0 && candidates.length === 0;
  if (candidates.length === 0) candidates = withoutRepeats(allowed);
  if (candidates.length === 0) return { items: [], relaxed: false };

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

  // 지금 상태: ctx(p) = (p에 붙은 T 원소 수) / |T|. 조건이 있으면 최종 = 0.6·score + 0.4·ctx
  const conditioned = hasConditions(context);
  const wants = resolveWants(context, tags);
  const reviewsOf = new Map<number, CurrentReview[]>();
  for (const r of reviews) {
    if (!reviewsOf.has(r.placeId)) reviewsOf.set(r.placeId, []);
    reviewsOf.get(r.placeId)!.push(r);
  }
  const matchedWants = (p: number): Want[] => {
    if (wants.length === 0) return [];
    const descriptive = new Set(assigned(p));
    const evaluative = wants.some((x) => 'tag' in x && x.tag.groupKind === 'evaluative')
      ? evaluativePassed(p, reviewsOf.get(p) ?? [], tags)
      : new Set<number>();
    const category = places.get(p)?.category;
    return wants.filter((x) =>
      'category' in x
        ? x.category === category
        : x.tag.groupKind === 'evaluative'
          ? evaluative.has(x.tag.id)
          : descriptive.has(x.tag.id)
    );
  };

  const scored = candidates.map((p) => {
    const x = placeVector(places.get(p)?.category, assigned(p), tagWeight);
    const cf = cfMax > 0 ? (cfRaw.get(p) ?? 0) / cfMax : 0;
    const cb = cosine(taste, x);
    const pop = popMax > 0 ? (scores.get(p)?.score ?? 0) / popMax : 0;
    const terms = { cf: alpha * cf, cb: (1 - alpha) * 0.6 * cb, pop: (1 - alpha) * 0.4 * pop };
    const base = terms.cf + terms.cb + terms.pop;
    const matched = matchedWants(p);
    const ctx = wants.length > 0 ? matched.length / wants.length : 0;
    return { p, x, terms, matched, score: conditioned ? 0.6 * base + 0.4 * ctx : base };
  });
  scored.sort((a, b) => {
    const d = b.score - a.score;
    return Math.abs(d) > EPS ? d : compareTie(a.p, b.p, scores, places);
  });

  const positions = rankPositions(scores, places);
  const tagLabel = new Map(tags.map((t) => [t.id, t.label]));
  const myFirst = myList.find((i) => i.rank === 1) ?? myList[0];

  // 사유: 지금 상태 조건이 맞았으면 그 조건 1~2개가 먼저. 아니면 세 항 중 기여 최대 항 (동률이면 CF → CB → POP 순)
  const reasonFor = ({ p, x, terms, matched }: (typeof scored)[number]): string => {
    if (matched.length > 0) {
      return `${matched.slice(0, 2).map((m) => `#${m.label}`).join(' · ')}에 딱 맞는 곳`;
    }

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

    // POP > 0이면 누군가 리스트에 넣은 가게라 항상 순위가 있다
    const position = positions.get(p);
    return position ? `국캠 전체 ${position}위` : FALLBACK_REASON;
  };

  const items = scored.slice(0, count).map((s) => ({ placeId: s.p, reason: reasonFor(s) }));
  return { items, relaxed };
}

/** score = α·CF + (1−α)·(0.6·CB + 0.4·POP) (plan.md §5-6).
 *  insert와 오늘 free 결과 재사용도 여기서 한다. 결과가 0곳이면 insert하지 않는다.
 *  context(지금 상태 조건)는 새로 계산할 때만 반영한다. 오늘 free 기록이 있으면 무시 */
export async function recommend(
  userId: string,
  kind: RecKind,
  excludeIds?: number[],
  context?: RecContext
): Promise<RecResult> {
  try {
    return await runRecommend(userId, kind, excludeIds, context);
  } catch (e) {
    // 다른 lib(lists·places·tags·reviews 등)의 조회 실패 원문도 여기서 사용자용 문구로 바꾼다
    if (e instanceof Error && USER_MESSAGES.has(e.message)) throw e;
    throw loadFailed(e);
  }
}

/** 무료 선을 넘는 조건은 프리미엄일 때만 쓰고, 아니면 땡기는 거 1개로 자른다 (§5-6) */
async function allowedContext(
  userId: string,
  kind: RecKind,
  context: RecContext = {}
): Promise<RecContext> {
  // premium 추천은 runRecommend에서 hasPremium을 이미 확인했다
  const premium = kind === 'premium' || (exceedsFree(context) && (await hasPremium(userId)));
  return scopeContext(context, premium);
}

/** 저장하고, 대분류 제한을 풀었으면 안내를 붙인다 */
async function finish(
  userId: string,
  kind: RecKind,
  { items, relaxed }: { items: RecItem[]; relaxed: boolean }
): Promise<RecResult> {
  if (items.length === 0) return items;
  await saveResult(userId, kind, items);
  return relaxed ? Object.assign(items, { notice: RELAXED_NOTICE }) : items;
}

async function runRecommend(
  userId: string,
  kind: RecKind,
  excludeIds?: number[],
  context?: RecContext
): Promise<RecResult> {
  if (kind === 'free') {
    const saved = await getTodayFree(userId);
    if (saved) return saved;
    // 최근 7일에 받은 free·point 가게는 되도록 빼고 고른다
    const recent = await getRecentPlaceIds(userId, ['free', 'point']);
    const ctx = await allowedContext(userId, kind, context);
    return finish(userId, 'free', await computeRecommendations(userId, 1, [], recent, ctx));
  }

  if (kind === 'point') {
    if ((await getPointBalance(userId)) < POINT_COST) throw new Error(NOT_ENOUGH_POINTS_MESSAGE);
    // 3P를 내고 최근에 받은 가게가 또 나오지 않도록 최근 7일 free·point 가게를 되도록 뺀다
    const recent = await getRecentPlaceIds(userId, ['free', 'point']);
    const ctx = await allowedContext(userId, kind, context);
    return finish(userId, 'point', await computeRecommendations(userId, 1, [], recent, ctx));
  }

  if (!(await hasPremium(userId))) throw new Error(PREMIUM_REQUIRED_MESSAGE);
  const ctx = await allowedContext(userId, kind, context);
  return finish(userId, 'premium', await computeRecommendations(userId, 5, excludeIds, [], ctx));
}
