'use client';
// 담당 B — plan.md §1 화면 3 "지금 상태" 조건, §5-6 지금 상태 조건
import type { ReactNode } from 'react';
import Link from 'next/link';
import type { Category, Tag } from '@/lib/types';
import {
  CRAVING_CATEGORIES,
  DEFAULT_HUNGER,
  FREE_CRAVINGS,
  PREMIUM_CRAVINGS,
  moodOptions,
  type RecContext,
} from '@/lib/recommend';

type MoodPickerProps = {
  value: RecContext;
  onChange: (next: RecContext) => void;
  tags: Tag[];
  /** hasPremium 결과. false면 땡기는 거 1개만, 나머지 질문은 잠금 */
  premium: boolean;
  disabled?: boolean;
};

const CHIP =
  'inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm disabled:opacity-50';
const CHIP_ON = `${CHIP} border-[#003876] bg-[#003876] text-white`;
const CHIP_OFF = `${CHIP} border-[#998878] bg-white text-[#2A211B] dark:bg-transparent dark:text-[#F2ECE6] dark:border-white/30`;
const CHIP_LOCKED = `${CHIP} border-dashed border-[#998878] bg-[#F3EFE8] text-[#7A5B43] dark:bg-white/5 dark:text-[#C9AE95] dark:border-white/30`;

function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={14}
      height={14}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

/** 질문 하나 = 제목 + 칩 한 줄(넘치면 가로 스크롤) */
function Row({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-bold">
        {title}
        {hint && <span className="ml-1.5 font-normal text-[#7A5B43] dark:text-[#C9AE95]">{hint}</span>}
      </p>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">{children}</div>
    </div>
  );
}

function Chip({
  label,
  on,
  disabled,
  onClick,
}: {
  label: string;
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={on ? CHIP_ON : CHIP_OFF}
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

/** 무료·포인트 사용자에게 보이는 잠금 칩. 누르면 결제 화면으로 */
function LockedChip({ label }: { label: string }) {
  return (
    <Link href="/premium" className={CHIP_LOCKED} aria-label={`${label} — 프리미엄 전용`}>
      <LockIcon />
      {label}
      <span className="text-[11px]">프리미엄</span>
    </Link>
  );
}

/** 같은 칩을 다시 누르면 해제되는 하나 고르기 */
function toggleOne<T>(current: T | undefined, next: T): T | undefined {
  return current === next ? undefined : next;
}

export default function MoodPicker({ value, onChange, tags, premium, disabled }: MoodPickerProps) {
  const options = moodOptions(tags);
  const categories = value.categories ?? [];
  const tastes = value.tastes ?? [];
  const maxCravings = premium ? PREMIUM_CRAVINGS : FREE_CRAVINGS;
  const hunger = value.hunger ?? DEFAULT_HUNGER;

  /** 땡기는 거: 무료면 누른 것으로 바꾸고, 프리미엄이면 3개까지 더한다 */
  function toggleCraving(kind: 'categories' | 'tastes', item: string) {
    const list: string[] = kind === 'categories' ? categories : tastes;
    if (list.includes(item)) {
      onChange({ ...value, [kind]: list.filter((x) => x !== item) });
      return;
    }
    if (maxCravings === 1) {
      onChange({ ...value, categories: [], tastes: [], [kind]: [item] });
      return;
    }
    if (categories.length + tastes.length >= maxCravings) return;
    onChange({ ...value, [kind]: [...list, item] });
  }

  return (
    <div className="flex flex-col gap-4 rounded-[14px] bg-[#F3EFE8] p-4 text-left dark:bg-white/5">
      <Row title="땡기는 거" hint={premium ? `최대 ${PREMIUM_CRAVINGS}개` : '1개'}>
        {CRAVING_CATEGORIES.map((c: Category) => (
          <Chip
            key={`c:${c}`}
            label={c}
            on={categories.includes(c)}
            disabled={disabled}
            onClick={() => toggleCraving('categories', c)}
          />
        ))}
        {options.tastes.map((t) => (
          <Chip
            key={`t:${t}`}
            label={t}
            on={tastes.includes(t)}
            disabled={disabled}
            onClick={() => toggleCraving('tastes', t)}
          />
        ))}
      </Row>

      {options.hunger.length > 1 && (
        <Row title="배 상태">
          {options.hunger.map((h) =>
            premium ? (
              <Chip
                key={h}
                label={h}
                on={hunger === h}
                disabled={disabled}
                // 고른 걸 다시 누르면 기본(배고파요)으로
                onClick={() => onChange({ ...value, hunger: hunger === h ? DEFAULT_HUNGER : h })}
              />
            ) : (
              <LockedChip key={h} label={h} />
            )
          )}
        </Row>
      )}

      {options.company.length > 0 && (
        <Row title="누구랑">
          {options.company.map((c) =>
            premium ? (
              <Chip
                key={c}
                label={c}
                on={value.company === c}
                disabled={disabled}
                onClick={() => onChange({ ...value, company: toggleOne(value.company, c) })}
              />
            ) : (
              <LockedChip key={c} label={c} />
            )
          )}
        </Row>
      )}

      {(options.budget.length > 0 || options.quick) && (
        <Row title="예산·시간">
          {options.budget.map((b) =>
            premium ? (
              <Chip
                key={b}
                label={b}
                on={value.budget === b}
                disabled={disabled}
                onClick={() => onChange({ ...value, budget: toggleOne(value.budget, b) })}
              />
            ) : (
              <LockedChip key={b} label={b} />
            )
          )}
          {options.quick &&
            (premium ? (
              <Chip
                label="바로 먹고 싶어요"
                on={value.quick === true}
                disabled={disabled}
                onClick={() => onChange({ ...value, quick: !value.quick })}
              />
            ) : (
              <LockedChip label="바로 먹고 싶어요" />
            ))}
        </Row>
      )}
    </div>
  );
}
