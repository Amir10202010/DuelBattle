import { useState } from 'react';
import {
  ACHIEVEMENTS,
  STARTING_RATING,
  TOTAL_ACHIEVEMENT_XP,
  achievementOrder,
  type AchievementGroup,
  type PublicProfile,
} from '@battle/shared';

/**
 * What the game noticed.
 *
 * Locked ones are shown with what they ask for rather than as question marks: a
 * hidden award is a thing nobody plays towards, and every one of these is
 * something you could decide to go and do this evening. The ones that count up
 * carry a bar, because "fifty matches" with no idea how many you have played is
 * a number rather than a goal.
 */
const GROUPS: { id: AchievementGroup | 'all'; label: string }[] = [
  { id: 'all', label: 'Everything' },
  { id: 'first', label: 'First steps' },
  { id: 'habit', label: 'Habit' },
  { id: 'streak', label: 'Streaks' },
  { id: 'dominance', label: 'Dominance' },
  { id: 'craft', label: 'Craft' },
  { id: 'ladder', label: 'The ladder' },
];

export function Awards({ profile }: { profile: PublicProfile | null }) {
  const [group, setGroup] = useState<AchievementGroup | 'all'>('all');

  const stats = {
    rating: profile?.rating ?? STARTING_RATING,
    peakRating: profile?.peakRating ?? STARTING_RATING,
    matchesPlayed: profile?.matchesPlayed ?? 0,
    wins: profile?.wins ?? 0,
    losses: profile?.losses ?? 0,
    draws: profile?.draws ?? 0,
    streak: profile?.streak ?? 0,
    bestStreak: profile?.bestStreak ?? 0,
    xp: profile?.xp ?? 0,
  };
  const held = new Set(profile?.achievements ?? []);
  const ordered = achievementOrder(stats, [...held]).filter(
    (award) => group === 'all' || award.group === group,
  );
  const earnedXp = ACHIEVEMENTS.filter((a) => held.has(a.id)).reduce((sum, a) => sum + a.xp, 0);

  return (
    <main className="page page--awards">
      <header className="page__head">
        <p className="eyebrow">Awards</p>
        <h1 className="page__title display">
          {held.size} of {ACHIEVEMENTS.length}.
        </h1>
        <p className="page__lede">
          Every one of these is something that happens to you in a match, not a chore with a badge
          on it. They pay XP, and XP is the number that only ever goes up.
        </p>
      </header>

      <div className="awards__meter">
        <div className="climb__track">
          <div
            className="climb__fill"
            style={{ width: `${Math.round((held.size / ACHIEVEMENTS.length) * 100)}%` }}
          />
        </div>
        <p className="awards__xp mono">
          {earnedXp.toLocaleString('en-GB')} / {TOTAL_ACHIEVEMENT_XP.toLocaleString('en-GB')} XP
          earned from awards
        </p>
      </div>

      <div className="tabs tabs--wrap" role="tablist" aria-label="Award groups">
        {GROUPS.map((option) => (
          <button
            key={option.id}
            role="tab"
            type="button"
            aria-selected={group === option.id}
            className={`tabs__tab ${group === option.id ? 'is-active' : ''}`}
            onClick={() => setGroup(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <ul className="awards">
        {ordered.map((award) => {
          const has = held.has(award.id);
          const step = !has ? award.progress?.(stats) : undefined;
          return (
            <li
              key={award.id}
              className={`award award--${award.rarity} ${has ? 'is-held' : 'is-locked'}`}
            >
              <div className="award__head">
                <h2 className="award__name">{award.name}</h2>
                <span className="award__xp mono">{award.xp} XP</span>
              </div>
              <p className="award__what">{award.description}</p>
              {step && step.need > 1 && (
                <div className="award__progress">
                  <span className="award__bar" aria-hidden="true">
                    <i style={{ width: `${Math.round((step.have / step.need) * 100)}%` }} />
                  </span>
                  <span className="award__count mono">
                    {step.have}/{step.need}
                  </span>
                </div>
              )}
              <span className="award__rarity">{has ? 'Unlocked' : award.rarity}</span>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
