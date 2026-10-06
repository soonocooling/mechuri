// 담당 B — plan.md §10, §6 tags 시드
import type { Category, Tag } from './types';
import { supabase } from './supabase';

type TagRow = {
  id: number;
  group_key: string;
  group_label: string;
  group_kind: string;
  max_select: number;
  label: string;
  parent_label: string | null;
  value: number | null;
  sort: number;
};

const COLUMNS =
  'id, group_key, group_label, group_kind, max_select, label, parent_label, value, sort';

/** plan.md §6 표의 그룹 순서. sort는 그룹 안에서 1부터 다시 시작하므로 그룹 순서를 따로 둔다 */
export const GROUP_ORDER = [
  'cuisine',
  'taste',
  'mood',
  'situation',
  'price',
  'clean',
  'kind',
  'value',
  'portion',
  'wait',
];

/** 한 그룹과 그 칩들. 그룹 공통값(label·kind·maxSelect)은 그룹의 첫 칩에서 가져온다 */
export type TagGroup = {
  groupKey: string;
  groupLabel: string;
  groupKind: 'descriptive' | 'evaluative';
  maxSelect: number;
  tags: Tag[];
};

function toTag(r: TagRow): Tag {
  return {
    id: r.id,
    groupKey: r.group_key,
    groupLabel: r.group_label,
    groupKind: r.group_kind as Tag['groupKind'],
    maxSelect: r.max_select,
    label: r.label,
    parentLabel: r.parent_label,
    value: r.value,
    sort: r.sort,
  };
}

function groupIndex(groupKey: string): number {
  const i = GROUP_ORDER.indexOf(groupKey);
  return i === -1 ? GROUP_ORDER.length : i;
}

/** 그룹 순서 → 그룹 안에서는 sort 순 */
function compareTags(a: Tag, b: Tag): number {
  const g = groupIndex(a.groupKey) - groupIndex(b.groupKey);
  if (g !== 0) return g;
  if (a.groupKey !== b.groupKey) return a.groupKey.localeCompare(b.groupKey);
  return a.sort - b.sort;
}

/** tags 전체(§6 시드 72행). 그룹 순서 → sort 순으로 정렬해서 돌려준다 */
export async function getTags(): Promise<Tag[]> {
  const { data, error } = await supabase.from('tags').select(COLUMNS).returns<TagRow[]>();
  if (error) throw new Error(error.message);
  return data.map(toTag).sort(compareTags);
}

/**
 * 칩을 그룹별로 묶는다. 순서는 getTags()와 같은 규칙(그룹 순서 → sort).
 * placeCategory를 주면 cuisine 그룹은 parentLabel이 그 대분류인 칩만 남긴다(기타면 전부, §6).
 * 칩이 하나도 남지 않는 그룹은 빼고 돌려준다.
 */
export function groupTags(tags: Tag[], placeCategory?: Category): TagGroup[] {
  const groups = new Map<string, TagGroup>();
  for (const tag of [...tags].sort(compareTags)) {
    if (tag.groupKey === 'cuisine' && !isCuisineVisible(tag, placeCategory)) continue;
    const group = groups.get(tag.groupKey);
    if (group) {
      group.tags.push(tag);
      continue;
    }
    groups.set(tag.groupKey, {
      groupKey: tag.groupKey,
      groupLabel: tag.groupLabel,
      groupKind: tag.groupKind,
      maxSelect: tag.maxSelect,
      tags: [tag],
    });
  }
  return [...groups.values()];
}

/** cuisine 칩은 가게 대분류와 parentLabel이 같은 것만. 대분류가 '기타'거나 안 주면 전부 (§6) */
function isCuisineVisible(tag: Tag, placeCategory?: Category): boolean {
  if (!placeCategory || placeCategory === '기타') return true;
  return tag.parentLabel === placeCategory;
}
