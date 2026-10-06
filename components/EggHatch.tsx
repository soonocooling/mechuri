'use client';
// 담당 B — plan.md §1 화면 3 '메추리 알 깨기' 연출, §13 디자인 규칙
import { useEffect, useEffectEvent, useId, useRef, useState, type CSSProperties } from 'react';
import Image from 'next/image';
import { Do_Hyeon } from 'next/font/google';
import styles from './EggHatch.module.css';

// ---------------------------------------------------------------------------
// 시간대 문구 (한국 시간 기준)
// ---------------------------------------------------------------------------

export type Meal = '아침' | '점심' | '저녁' | '야식';

/** 6~11시 아침, 11~17시 점심, 17~22시 저녁, 22~6시 야식 */
function mealAt(hour: number): Meal {
  if (hour >= 6 && hour < 11) return '아침';
  if (hour >= 11 && hour < 17) return '점심';
  if (hour >= 17 && hour < 22) return '저녁';
  return '야식';
}

/** 개발 모드에서만: 주소 뒤에 ?hour=23 처럼 붙여 시간대 문구를 바꿔 본다 (배포 빌드에서는 빠진다) */
function devHourOverride(): number | null {
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('hour');
  const hour = raw === null ? NaN : Number(raw);
  return Number.isInteger(hour) && hour >= 0 && hour < 24 ? hour : null;
}

/** 지금 한국 시간의 끼니 */
export function mealNow(now: Date = new Date()): Meal {
  const override = devHourOverride();
  if (override !== null) return mealAt(override);
  const hour = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    hour: 'numeric',
    hourCycle: 'h23',
  }).format(now);
  return mealAt(Number(hour) % 24);
}

/** 결과가 0곳일 때 문구. 연출 층과 추천 탭 빈 상태에서 같이 쓴다 */
export const EMPTY_EGG_MESSAGE =
  '이번 알은 비어 있었어요. 내 맛집을 하나 더 넣으면 메추리가 더 잘 찾아요';

/** 들썩임·낙하 문구. 동작 줄이기 설정일 때 버튼의 요청 중 문구로도 쓴다 */
export function layingMessage(meal: Meal): string {
  return `메추리가 ${meal} 알을 낳고 있어요…`;
}

const CRACKING_MESSAGE = '톡, 톡… 알에 금이 가고 있어요';

// ---------------------------------------------------------------------------
// 층 순서: 흰 바탕·메추리·문구(back) < 드러나는 추천 탭 페이지 < 알·껍데기(front)
// 하단 탭(z 없음)과 유도 모달·리뷰 시트(z-50)보다 위
// ---------------------------------------------------------------------------

const Z_BACK = 60;
/** 추천 탭 페이지가 5단계에서 이 층으로 올라와 틈에서 벌어진다 */
export const HATCH_PAGE_Z = 61;
const Z_FRONT = 62;

// ---------------------------------------------------------------------------
// 타이밍 (ms). full = 무료 추천 약 6.7초, short = 3P·프리미엄 약 3.1초
// ---------------------------------------------------------------------------

/** 엉덩이 들썩임 한 번. 응답이 늦으면 이 단위로 반복한다 */
const LAP_MS = 700;
/** 빈 알 문구를 보여주는 시간 */
const EMPTY_HOLD_MS = 2400;

const TIMING = {
  full: { intro: 300, minLaps: 2, drop: 1000, settle: 400, crack: 2000, open: 1600 },
  short: { intro: 200, minLaps: 1, drop: 600, settle: 0, crack: 600, open: 1000 },
} as const;

type Variant = keyof typeof TIMING;
type Timing = (typeof TIMING)[Variant];

/**
 * intro 연출 층이 뜸 → lay 들썩임(결과 올 때까지 반복) → drop 알이 떨어져 튐 → settle 잠깐 멈춤
 * → crack 금(full 3번·short 1번) → open 껍데기가 날아가고 페이지가 벌어짐
 * 0곳이면 settle → wobble 흔들리기만 함 → empty 빈 알 문구
 */
type Phase = 'intro' | 'lay' | 'drop' | 'settle' | 'crack' | 'wobble' | 'open' | 'empty';

function durationOf(phase: Phase, t: Timing): number {
  switch (phase) {
    case 'intro':
      return t.intro;
    case 'lay':
      return LAP_MS;
    case 'drop':
      return t.drop;
    case 'settle':
      return t.settle;
    case 'crack':
    case 'wobble':
      return t.crack;
    case 'open':
      return t.open;
    case 'empty':
      return EMPTY_HOLD_MS;
  }
}

/** 지원하는 기기에서만 짧게 진동 */
function vibrate() {
  try {
    if ('vibrate' in navigator) navigator.vibrate(25);
  } catch {
    // 진동을 막은 브라우저는 무시한다
  }
}

// ---------------------------------------------------------------------------
// 알 모양 (viewBox 0 0 100 128). 윗·아랫껍데기는 같은 알을 지그재그 clipPath로 나눈다
// ---------------------------------------------------------------------------

const INK = '#2A211B';
const SPOT = '#7A5B43';
const SHELL = '#F3EFE8';

const EGG_PATH = 'M50 3 C75 3 95 44 95 79 C95 107 75 125 50 125 C25 125 5 107 5 79 C5 44 25 3 50 3 Z';

/** 금(지그재그). 왼쪽에서 오른쪽으로 그려지도록 왼쪽 끝에서 시작한다 */
const CRACK_POINTS: [number, number][] = [
  [0, 66], [10, 66], [18, 58], [28, 70], [38, 59], [48, 71],
  [58, 59], [68, 70], [78, 58], [88, 69], [100, 62],
];
const CRACK_PATH = CRACK_POINTS.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ');
const ZIGZAG = CRACK_POINTS.map(([x, y]) => `${x},${y}`).join(' ');
/** 윗껍데기: 위쪽 끝 → 오른쪽 위 → 금을 따라 오른쪽에서 왼쪽으로 */
const TOP_CLIP = `0,0 100,0 ${[...CRACK_POINTS].reverse().map(([x, y]) => `${x},${y}`).join(' ')}`;
/** 아랫껍데기: 금을 따라 왼쪽에서 오른쪽 → 아래쪽 끝 */
const BOTTOM_CLIP = `${ZIGZAG} 100,128 0,128`;
/** 금의 평균 높이 / 알 높이 — 페이지가 벌어지기 시작하는 틈의 위치 */
const CRACK_Y_RATIO = 64 / 128;

/** 메추리알 반점: [cx, cy, rx, ry, 색] */
const SPOTS: [number, number, number, number, string][] = [
  [30, 28, 5, 4, SPOT], [62, 20, 3, 2.5, SPOT], [46, 34, 3, 2.5, INK], [24, 46, 2.5, 2, SPOT],
  [72, 42, 7, 5, SPOT], [58, 40, 2, 2, INK], [40, 52, 4, 3, SPOT], [76, 62, 2.5, 2, INK],
  [20, 70, 6, 4.5, SPOT], [55, 80, 8, 6, SPOT], [80, 78, 4, 3, SPOT], [28, 86, 3, 2.2, INK],
  [35, 98, 5, 4, SPOT], [62, 94, 2.2, 2, INK], [68, 104, 6, 4, SPOT], [84, 96, 3, 2.5, SPOT],
  [48, 112, 3, 2.5, SPOT],
];

function EggHalf({
  uid,
  part,
  className,
  crackClass,
}: {
  uid: string;
  part: 'top' | 'bottom';
  className: string;
  crackClass: string;
}) {
  const halfId = `${uid}-${part}`;
  const shapeId = `${uid}-${part}-shape`;
  return (
    <svg viewBox="0 0 100 128" className={`${styles.half} ${className}`} aria-hidden>
      <defs>
        <clipPath id={halfId}>
          <polygon points={part === 'top' ? TOP_CLIP : BOTTOM_CLIP} />
        </clipPath>
        <clipPath id={shapeId}>
          <path d={EGG_PATH} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${halfId})`}>
        <path d={EGG_PATH} fill={SHELL} />
        <g clipPath={`url(#${shapeId})`}>
          {SPOTS.map(([cx, cy, rx, ry, fill]) => (
            <ellipse key={`${cx}-${cy}`} cx={cx} cy={cy} rx={rx} ry={ry} fill={fill} />
          ))}
          {/* 두 껍데기에 같은 금을 그려 반씩 보인다. pathLength=1로 stroke-dashoffset 0~1 */}
          <path
            d={CRACK_PATH}
            pathLength={1}
            className={crackClass}
            fill="none"
            stroke={INK}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </g>
        <path d={EGG_PATH} fill="none" stroke={INK} strokeWidth={2} />
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// 연출 층
// ---------------------------------------------------------------------------

const display = Do_Hyeon({ weight: '400', subsets: ['latin'], fallback: ['system-ui', 'sans-serif'] });

type EggHatchProps = {
  variant: Variant;
  meal: Meal;
  /** recommend() 결과: 기다리는 중 / 1곳 이상 / 0곳. 에러면 페이지가 이 층을 바로 내린다 */
  outcome: 'pending' | 'found' | 'empty';
  /** 5단계 시작. crackY = 금의 화면 y(px), durationMs = 페이지가 벌어지는 시간 */
  onOpen: (crackY: number, durationMs: number) => void;
  /** 연출 끝(껍데기가 다 사라짐, 또는 빈 알 문구 후). 페이지가 이 층을 내린다 */
  onFinish: () => void;
};

export default function EggHatch({ variant, meal, outcome, onOpen, onFinish }: EggHatchProps) {
  const t = TIMING[variant];
  const uid = `egg${useId().replace(/[^\w-]/g, '')}`;
  const [phase, setPhase] = useState<Phase>('intro');
  // 지금까지 끝난 들썩임 횟수
  const [laps, setLaps] = useState(0);
  const eggRef = useRef<HTMLDivElement>(null);

  // 단계가 끝날 때 다음 단계를 고른다. 최신 outcome·콜백을 읽되 타이머는 다시 걸지 않는다
  const advance = useEffectEvent(() => {
    switch (phase) {
      case 'intro':
        setPhase('lay');
        return;
      case 'lay': {
        // 최소 횟수를 채웠고 응답이 왔으면 알을 떨어뜨린다. 아니면 한 번 더 들썩인다
        const done = laps + 1;
        if (done >= t.minLaps && outcome !== 'pending') setPhase('drop');
        else setLaps(done);
        return;
      }
      case 'drop':
        setPhase('settle');
        return;
      case 'settle':
        setPhase(outcome === 'empty' ? 'wobble' : 'crack');
        return;
      case 'crack': {
        const rect = eggRef.current?.getBoundingClientRect();
        onOpen(rect ? rect.top + rect.height * CRACK_Y_RATIO : window.innerHeight / 2, t.open);
        vibrate();
        setPhase('open');
        return;
      }
      case 'wobble':
        setPhase('empty');
        return;
      case 'open':
      case 'empty':
        onFinish();
        return;
    }
  });

  // 단계마다 타이머 하나. 페이지를 떠나면(언마운트) 정리된다
  useEffect(() => {
    const id = window.setTimeout(advance, durationOf(phase, t));
    return () => window.clearTimeout(id);
  }, [phase, laps, t]);

  const vars = {
    '--intro': `${t.intro}ms`,
    '--lap': `${LAP_MS}ms`,
    '--drop': `${t.drop}ms`,
    '--crack': `${t.crack}ms`,
    '--open': `${t.open}ms`,
  } as CSSProperties;

  const caption =
    phase === 'empty'
      ? EMPTY_EGG_MESSAGE
      : phase === 'crack' || phase === 'wobble' || phase === 'open'
        ? CRACKING_MESSAGE
        : layingMessage(meal);

  const shaking = phase === 'crack' || phase === 'wobble';
  const motionClass =
    phase === 'drop'
      ? styles.drop
      : shaking
        ? variant === 'full'
          ? styles.shake3
          : styles.shake1
        : '';
  // 0곳(wobble·empty)이면 금이 가지 않는다
  const crackClass =
    phase === 'crack'
      ? variant === 'full'
        ? styles.crack3
        : styles.crack1
      : phase === 'open'
        ? styles.crackDone
        : styles.crackHidden;
  const opening = phase === 'open';

  return (
    <>
      <div className={styles.back} style={{ ...vars, zIndex: Z_BACK }}>
        <p role="status" className={`${display.className} ${styles.caption}`}>
          {caption}
        </p>
        <div className={styles.quail}>
          <div className={phase === 'lay' ? styles.bob : undefined}>
            <Image
              src="/brand/mechuri-mascot.svg"
              alt=""
              width={150}
              height={150}
              loading="eager"
              unoptimized
            />
          </div>
        </div>
      </div>

      <div className={styles.front} style={{ ...vars, zIndex: Z_FRONT }} aria-hidden>
        {phase !== 'intro' && phase !== 'lay' && (
          <div ref={eggRef} className={styles.egg}>
            <div className={`${styles.eggMotion} ${motionClass}`}>
              <EggHalf
                uid={uid}
                part="bottom"
                className={opening ? styles.baseFall : ''}
                crackClass={crackClass}
              />
              <EggHalf
                uid={uid}
                part="top"
                className={opening ? styles.lidFly : ''}
                crackClass={crackClass}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
