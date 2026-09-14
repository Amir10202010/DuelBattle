import { tr, useUiPreferences } from '../i18n/index.js';
import { useState } from 'react';
import { Check, LockKeyhole, Sparkles, Gift } from 'lucide-react';
import { ACHIEVEMENTS, achievementOrder, type PublicProfile } from '@battle/shared';
import { RewardArt } from '../components/GameArt.jsx';
const FILTERS = ['All', 'Achievements', 'Ranks', 'Streaks', 'Special', 'Locked'] as const;
export function Awards({ profile }: { profile: PublicProfile | null }) {
  useUiPreferences();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');
  if (!profile) return null;
  const held = new Set(profile.achievements);
  const ordered = achievementOrder(profile, [...held]).filter((a) => {
    if (filter === 'Locked') return !held.has(a.id);
    if (filter === 'Ranks') return a.group === 'ladder';
    if (filter === 'Streaks') return a.group === 'streak';
    if (filter === 'Special') return a.rarity === 'legendary' || a.group === 'craft';
    if (filter === 'Achievements') return a.group !== 'ladder' && a.group !== 'streak';
    return true;
  });
  const earnedXp = ACHIEVEMENTS.filter((a) => held.has(a.id)).reduce((sum, a) => sum + a.xp, 0);
  return (
    <main className="page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">{tr('The collection')}</span>
          <h1>{tr('Little moments. Lasting rewards.')}</h1>
          <p>{tr('Make the play. Earn the badge. Every unlock is yours to keep.')}</p>
        </div>
        <span className="status-tag">
          <Gift size={15} /> {tr(held.size)}
          {' / '}
          {tr(ACHIEVEMENTS.length)}
          {tr(' collected')}
        </span>
      </header>
      <section className="collection-banner">
        <div className="collection-banner__art">
          <RewardArt group="dominance" rarity="legendary" />
        </div>
        <div>
          <span className="eyebrow">{tr('Your trophy cabinet')}</span>
          <h2>
            {tr(held.size ? `${held.size} reasons to play again.` : 'A little empty. For now.')}
          </h2>
          <p>
            {tr(earnedXp.toLocaleString())}
            {tr(' bonus XP earned from achievements.')}
          </p>
          <div
            className="progress-track"
            role="progressbar"
            aria-label={tr('Collection completed')}
            aria-valuenow={held.size}
            aria-valuemin={0}
            aria-valuemax={ACHIEVEMENTS.length}
          >
            <i style={{ width: `${(held.size / ACHIEVEMENTS.length) * 100}%` }} />
          </div>
        </div>
        <span className="collection-fraction">
          <b>{tr(held.size.toString().padStart(2, '0'))}</b>
          {'/'}
          {tr(ACHIEVEMENTS.length)}
        </span>
      </section>
      <div className="filter-row" role="group" aria-label={tr('Filter rewards')}>
        {FILTERS.map((f) => (
          <button
            key={f}
            className={`filter ${f === filter ? 'is-active' : ''}`}
            aria-pressed={f === filter}
            onClick={() => setFilter(f)}
          >
            {tr(f)}
            {f === 'Locked' && <LockKeyhole size={13} />}
          </button>
        ))}
      </div>
      <ul className="reward-grid">
        {ordered.map((award) => {
          const has = held.has(award.id);
          const progress = award.progress?.(profile);
          return (
            <li
              key={award.id}
              className={`reward-card reward-card--${award.rarity} ${has ? 'is-unlocked' : ''}`}
            >
              <div className="reward-card__top">
                <span className="rarity">{tr(award.rarity)}</span>
                {has ? (
                  <Check size={16} aria-label={tr('Unlocked')} />
                ) : (
                  <LockKeyhole size={14} aria-label={tr('Locked')} />
                )}
              </div>
              <RewardArt group={award.group} rarity={award.rarity} locked={!has} />
              <h2>{tr(award.name)}</h2>
              <p>{tr(award.description)}</p>
              <div className="reward-card__bottom">
                <span>
                  <Sparkles size={13} />
                  {' +'}
                  {tr(award.xp)}
                  {tr(' XP')}
                </span>
                <span>
                  {tr(
                    has
                      ? 'Collected'
                      : progress
                        ? `${progress.have} / ${progress.need}`
                        : 'In one match',
                  )}
                </span>
              </div>
              <div
                className="progress-track"
                role="progressbar"
                aria-label={tr(`${award.name} progress`)}
                aria-valuenow={
                  has
                    ? 100
                    : progress
                      ? Math.min(100, Math.round((progress.have / progress.need) * 100))
                      : 0
                }
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <i
                  style={{
                    width: `${has ? 100 : progress ? Math.min(100, (progress.have / progress.need) * 100) : 0}%`,
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      {!ordered.length && (
        <div className="empty">
          <Sparkles size={30} />
          <h2>{tr('Collection complete.')}</h2>
          <p>{tr('You have unlocked every reward in this category.')}</p>
          <button className="btn" onClick={() => setFilter('All')}>
            {tr('View all rewards')}
          </button>
        </div>
      )}
      <p className="page-note">
        <Check size={14} />
        {tr(
          ' Rewards are granted automatically after eligible ranked battles. No claim button, no missed XP.',
        )}
      </p>
    </main>
  );
}
