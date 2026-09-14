import { tr, useUiPreferences } from '../i18n/index.js';
import { memo } from 'react';
import { TIERS, rankFor, type AchievementGroup } from '@battle/shared';
import { Award, Flame, Flag, Gem, Scan, Sparkles } from 'lucide-react';

const TINTS = [
  '#9da9be',
  '#c7a38b',
  '#b9e65c',
  '#65d8bf',
  '#6eb9f2',
  '#b69bfc',
  '#f0b975',
  '#f6df92',
];
const MARKS = [
  'M38 43h24v24H38z',
  'M50 30 69 51 50 73 31 51Z',
  'M54 27 34 54h14l-4 22 24-32H53Z',
  'M29 48 50 29 71 48 50 69Z M40 49l10-9 10 9-10 9Z',
  'M29 38h42L62 65H38Z M35 32h30 M43 72h14',
  'M50 25 57 43 76 49 57 56 50 76 43 56 24 49 43 43Z',
  'M27 35 40 47 50 27 60 47 73 35 65 68H35Z',
  'M25 39 38 47 50 25 62 47 75 39 67 70H33Z M39 77h22',
];

export const RankEmblem = memo(function RankEmblem({
  rating = 1000,
  size = 96,
  placing = false,
}: {
  rating?: number;
  size?: number;
  placing?: boolean;
}) {
  useUiPreferences();
  const rank = rankFor(rating);
  const index = TIERS.indexOf(rank.tier);
  const tint = placing ? '#9da9be' : TINTS[index];
  return (
    <svg
      className={`rank-emblem ${placing ? 'is-placing' : ''}`}
      width={size}
      height={size}
      viewBox="0 0 100 110"
      role="img"
      aria-label={tr(placing ? 'Placement emblem' : `${rank.tier.name} emblem`)}
      style={{ '--emblem': tint } as React.CSSProperties}
    >
      <path d="M50 5 88 23v44L50 103 12 67V23Z" fill="currentColor" opacity=".08" />
      <path
        d="M50 10 83 26v38L50 96 17 64V26Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="m8 43 9 7M92 43l-9 7M8 59l10 5M92 59l-10 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        d={placing ? MARKS[0] : MARKS[index]}
        fill={index === 4 ? 'none' : 'currentColor'}
        fillRule="evenodd"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="m44 84 6 5 6-5" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
});

const ICONS = {
  first: Flag,
  habit: Award,
  streak: Flame,
  dominance: Gem,
  craft: Scan,
  ladder: Sparkles,
};
export function RewardArt({
  group,
  rarity = 'common',
  locked = false,
}: {
  group: AchievementGroup;
  rarity?: string;
  locked?: boolean;
}) {
  useUiPreferences();
  const Icon = ICONS[group];
  return (
    <span
      className={`reward-art reward-art--${rarity} ${locked ? 'is-locked' : ''}`}
      aria-hidden="true"
    >
      <Icon size={32} strokeWidth={1.5} />
    </span>
  );
}

/** Lightweight vector object art for the daily challenge and landing demo. */
export function MugArt() {
  useUiPreferences();
  return (
    <svg
      className="mug-art"
      viewBox="0 0 260 240"
      role="img"
      aria-label={tr('Red mug held inside a camera target')}
    >
      <ellipse cx="133" cy="207" rx="70" ry="9" fill="#000" opacity=".22" />
      <path d="M173 80h17c46 0 46 73-2 73h-16" fill="none" stroke="#fc795f" strokeWidth="20" />
      <path d="M64 65h117v100c0 55-117 55-117 0Z" fill="#e75f4b" />
      <path
        d="M76 75v88c0 22 20 29 35 31"
        fill="none"
        stroke="#ff937a"
        strokeWidth="7"
        opacity=".65"
      />
      <ellipse cx="122" cy="65" rx="59" ry="17" fill="#ff9a81" />
      <ellipse cx="122" cy="64" rx="47" ry="10" fill="#6d302c" />
      <path
        d="M30 69V36h34M196 36h34v33M30 176v32h34M196 208h34v-32"
        stroke="#c6ed72"
        strokeWidth="2"
        fill="none"
      />
      <path
        d="m106 127 12 12 23-26"
        stroke="#ffd6bb"
        strokeWidth="6"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
