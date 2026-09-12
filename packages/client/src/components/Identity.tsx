import { memo } from 'react';
import {
  AVATAR_COLORS,
  AVATAR_SHAPES,
  levelFor,
  normalizeAvatar,
  rankFor,
  type Avatar as AvatarValue,
} from '@battle/shared';

/**
 * A player, drawn without a photograph.
 *
 * Six shapes and eight colours is forty-eight identities, which is more than
 * enough to tell a leaderboard apart and few enough that every one of them can
 * be drawn deliberately. They are SVG paths rather than images because they end
 * up at 24px on a scoreboard and at 96px on a profile, and a raster asset would
 * have to be wrong at one of those.
 */
export const Avatar = memo(function Avatar({
  avatar,
  size = 40,
  name,
}: {
  avatar: AvatarValue | undefined;
  size?: number;
  /** Used for the initial, and for the label assistive tech reads. */
  name?: string;
}) {
  const { shape, color } = normalizeAvatar(avatar);
  const tint = AVATAR_COLORS[color]!;
  const kind = AVATAR_SHAPES[shape]!;

  return (
    <span
      className="avatar"
      style={{ width: size, height: size, '--avatar-tint': tint } as React.CSSProperties}
      role="img"
      aria-label={name ? `${name}'s mark` : 'Player mark'}
    >
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <Mark kind={kind} />
      </svg>
    </span>
  );
});

function Mark({ kind }: { kind: string }) {
  switch (kind) {
    case 'disc':
      return <circle cx="24" cy="24" r="13" />;
    case 'wedge':
      return <path d="M24 9 39 36H9Z" />;
    case 'grid':
      return (
        <>
          <rect x="10" y="10" width="11" height="11" />
          <rect x="27" y="10" width="11" height="11" />
          <rect x="10" y="27" width="11" height="11" />
          <rect x="27" y="27" width="11" height="11" />
        </>
      );
    case 'ring':
      return <path d="M24 8a16 16 0 1 0 0 32 16 16 0 0 0 0-32Zm0 9a7 7 0 1 1 0 14 7 7 0 0 1 0-14Z" />;
    case 'cross':
      return <path d="M19 8h10v11h11v10H29v11H19V29H8V19h11Z" />;
    default:
      // The bolt: the wordmark's own shape, so seat one always reads as home.
      return <path d="M27 6 13 27h9l-2 15 15-22h-9l1-14Z" />;
  }
}

/**
 * Where somebody is on the ladder, in the smallest badge that still says it.
 *
 * A rating without a rung is a number, and a rung without a rating is a word.
 * Both, or neither.
 */
export const RankBadge = memo(function RankBadge({
  rating,
  placed,
  size = 'md',
}: {
  rating: number;
  placed: boolean;
  size?: 'sm' | 'md';
}) {
  const rank = rankFor(rating);
  return (
    <span className={`rankbadge rankbadge--${size} ${placed ? '' : 'rankbadge--placing'}`}>
      <span className="rankbadge__name">{placed ? rank.label : 'Placing'}</span>
      <span className="rankbadge__value mono">{rating}</span>
    </span>
  );
});

/** A level, and how far through it somebody is. */
export const LevelBar = memo(function LevelBar({ xp, compact = false }: { xp: number; compact?: boolean }) {
  const level = levelFor(xp);
  return (
    <div className={`levelbar ${compact ? 'levelbar--compact' : ''}`}>
      <div className="levelbar__head">
        <span className="levelbar__level">Level {level.level}</span>
        {!compact && (
          <span className="levelbar__xp mono">
            {level.into} / {level.cost} XP
          </span>
        )}
      </div>
      <div className="levelbar__track">
        <div className="levelbar__fill" style={{ width: `${Math.round(level.progress * 100)}%` }} />
      </div>
    </div>
  );
});
