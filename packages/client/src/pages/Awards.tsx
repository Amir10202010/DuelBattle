import { tr, useUiPreferences } from '../i18n/index.js';
import { useState } from 'react';
import { Check, LockKeyhole, Sparkles } from 'lucide-react';
import {
  ACHIEVEMENTS,
  achievementOrder,
  getAchievement,
  type Achievement,
  type PublicProfile,
} from '@battle/shared';
import { RewardArt } from '../components/GameArt.jsx';
import { Dialog } from '../components/Dialog.jsx';

type Filter = 'all' | 'held' | 'locked';

/**
 * The trophy cabinet.
 *
 * A medal is a thing you look at, so a card here is the art and a name and
 * nothing else — the requirement, the progress and the XP live one tap away in
 * the detail sheet. Twenty-eight cards each carrying four lines of small print
 * is a spreadsheet, not a cabinet, and on a phone it was a very long scroll.
 */
export function Awards({ profile }: { profile: PublicProfile | null }) {
  useUiPreferences();
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<string | null>(null);
  if (!profile) return null;

  const held = new Set(profile.achievements);
  const ordered = achievementOrder(profile, [...held]);
  const shown = ordered.filter((award) =>
    filter === 'held' ? held.has(award.id) : filter === 'locked' ? !held.has(award.id) : true,
  );
  const share = Math.round((held.size / ACHIEVEMENTS.length) * 100);
  const selected = open ? (getAchievement(open) ?? null) : null;

  return (
    <main className="page awards">
      <header className="page__head">
        <h1 className="page__title display">{tr('Little moments. Lasting rewards.')}</h1>
      </header>

      <section className="cabinet plate">
        <div className="cabinet__art" aria-hidden="true">
          <RewardArt group="dominance" rarity="legendary" />
        </div>
        <div className="cabinet__copy">
          <span className="cabinet__count num">
            <b>{held.size}</b>
            {' / '}
            {ACHIEVEMENTS.length}
          </span>
          <span className="eyebrow">{tr('Collected')}</span>
          <div
            className="bar"
            role="progressbar"
            aria-label={tr('Collection completed')}
            aria-valuenow={held.size}
            aria-valuemin={0}
            aria-valuemax={ACHIEVEMENTS.length}
          >
            <i style={{ width: `${share}%` }} />
          </div>
        </div>
      </section>

      <div className="tabs tabs--block" role="group" aria-label={tr('Filter awards')}>
        <button
          className={filter === 'all' ? 'is-active' : ''}
          aria-pressed={filter === 'all'}
          onClick={() => setFilter('all')}
        >
          {tr('All')} {ACHIEVEMENTS.length}
        </button>
        <button
          className={filter === 'held' ? 'is-active' : ''}
          aria-pressed={filter === 'held'}
          onClick={() => setFilter('held')}
        >
          {tr('Earned')} {held.size}
        </button>
        <button
          className={filter === 'locked' ? 'is-active' : ''}
          aria-pressed={filter === 'locked'}
          onClick={() => setFilter('locked')}
        >
          {tr('Locked')} {ACHIEVEMENTS.length - held.size}
        </button>
      </div>

      {shown.length ? (
        <ul className="medals">
          {shown.map((award) => (
            <li key={award.id}>
              <button
                className={`medal is-${award.rarity} ${held.has(award.id) ? 'is-earned' : ''}`}
                onClick={() => setOpen(award.id)}
              >
                <span className="medal__art">
                  <RewardArt group={award.group} rarity={award.rarity} locked={!held.has(award.id)} />
                  <i aria-hidden="true">
                    {held.has(award.id) ? <Check size={13} /> : <LockKeyhole size={11} />}
                  </i>
                </span>
                <strong>{tr(award.name)}</strong>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="blank">
          <Sparkles size={28} />
          <h2>{tr(filter === 'held' ? 'Nothing earned yet.' : 'Nothing left to unlock.')}</h2>
          <button className="btn" onClick={() => setFilter('all')}>
            {tr('Show everything')}
          </button>
        </div>
      )}

      <Dialog
        open={Boolean(selected)}
        onClose={() => setOpen(null)}
        title={selected ? tr(selected.name) : ''}
      >
        {selected && (
          <AwardDetail award={selected} profile={profile} earned={held.has(selected.id)} />
        )}
      </Dialog>
    </main>
  );
}

function AwardDetail({
  award,
  profile,
  earned,
}: {
  award: Achievement;
  profile: PublicProfile;
  earned: boolean;
}) {
  useUiPreferences();
  const progress = award.progress?.(profile);
  const percent = earned
    ? 100
    : progress
      ? Math.min(100, Math.round((progress.have / progress.need) * 100))
      : 0;

  return (
    <div className={`award-detail is-${award.rarity}`}>
      <RewardArt group={award.group} rarity={award.rarity} locked={!earned} />
      <span className={`rarity is-${award.rarity}`}>{tr(award.rarity)}</span>
      <h2>{tr(award.name)}</h2>
      <p>{tr(award.description)}</p>

      <div
        className="bar"
        role="progressbar"
        aria-label={tr('Progress')}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <i style={{ width: `${percent}%` }} />
      </div>

      <div className="award-detail__facts">
        <div>
          <span className="eyebrow">{tr('Progress')}</span>
          <strong className="num">
            {earned
              ? tr('Earned')
              : progress
                ? `${progress.have} / ${progress.need}`
                : tr('One battle')}
          </strong>
        </div>
        <div>
          <span className="eyebrow">{tr('Reward')}</span>
          <strong className="num">
            <Sparkles size={14} />
            {' +'}
            {award.xp}
            {tr(' XP')}
          </strong>
        </div>
      </div>
    </div>
  );
}
