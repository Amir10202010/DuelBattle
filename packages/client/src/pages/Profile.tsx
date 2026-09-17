import { tr, useUiPreferences } from '../i18n/index.js';
import { useState } from 'react';
import { ArrowRight, Flame, Settings, Swords, Target, TrendingDown, Trophy } from 'lucide-react';
import {
  demotionRisk,
  isPlaced,
  nextRank,
  rankFor,
  type PublicProfile,
} from '@battle/shared';
import { LevelBar } from '../components/Identity.jsx';
import { RankEmblem } from '../components/GameArt.jsx';
import { BattleHistory } from '../components/BattleHistory.jsx';
import { Customization } from '../components/avatar/Customization.jsx';
import { MarkPicker } from '../components/avatar/MarkPicker.jsx';
import { Hero } from '../components/avatar/Hero.jsx';
import { useEconomy } from '../hooks/useEconomy.js';
import type { MatchStore } from '../net/store.js';

type Tab = 'loadout' | 'history';

const TABS: { id: Tab; label: string }[] = [
  { id: 'loadout', label: 'Loadout' },
  { id: 'history', label: 'History' },
];

/**
 * The locker: your player, not your account.
 *
 * The card at the top is the only place where the hero, the rank emblem, the
 * level and the record appear together — it is the thing a player is building.
 * Everything you can change about how you look is under one tab beneath it,
 * hero and ladder mark together, because a player has one idea of "me".
 */
export function Profile({
  profile,
  store,
  onNavigate,
}: {
  profile: PublicProfile | null;
  store: MatchStore;
  onNavigate: (path: string) => void;
}) {
  useUiPreferences();
  const { data: economy } = useEconomy();
  const [tab, setTab] = useState<Tab>('loadout');
  if (!profile) return null;

  const placed = isPlaced(profile.matchesPlayed);
  const rank = rankFor(profile.rating);
  const next = nextRank(profile.rating);
  const down = demotionRisk(profile.rating);
  const winRate = profile.matchesPlayed
    ? Math.round((profile.wins / profile.matchesPlayed) * 100)
    : null;

  const categories = new Map<string, number>();
  for (const record of profile.history ?? [])
    for (const category of record.categories ?? [])
      categories.set(category, (categories.get(category) ?? 0) + 1);
  const favorites = [...categories].sort((a, b) => b[1] - a[1]).slice(0, 3);

  return (
    <main className="page locker-page">
      <section className="playercard plate">
        <div className="playercard__char">
          <div className="hero-plinth">
            <Hero
              loadout={economy?.loadout ?? profile.loadout}
              size={280}
              label={tr('Your hero')}
            />
          </div>
        </div>

        <div className="playercard__id">
          <h1 className="display">{profile.name || tr('New player')}</h1>
          <span className="playercard__tier">
            <RankEmblem rating={profile.rating} size={26} placing={!placed} />
            {tr(placed ? rank.label : 'Placement in progress')}
          </span>
          <span className="playercard__mmr num">
            {profile.rating}
            <small>{tr('rating')}</small>
          </span>
        </div>

        <div className="playercard__meta">
          <div
            className="bar"
            role="progressbar"
            aria-valuenow={Math.round(rank.progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={tr('Progress to the next rank')}
          >
            <i style={{ width: `${Math.round(rank.progress * 100)}%` }} />
          </div>
          {next && (
            <p className="playercard__climb">
              {tr(`${next.pointsAway} rating to `)}
              <b>{tr(next.rank.label)}</b>
            </p>
          )}

          <LevelBar xp={profile.xp} />

          {placed && down && down.pointsAway <= 40 && (
            <p className="playercard__risk">
              <TrendingDown size={14} />
              {tr('Drop ')}
              {down.pointsAway + 1}
              {tr(' rating and you move to ')}
              <b>{tr(down.rank.label)}</b>
            </p>
          )}
        </div>

        <div className="playercard__actions">
          <button className="btn" onClick={() => onNavigate('/store')}>
            {tr('Store')}
            <ArrowRight size={15} />
          </button>
          <button
            className="icon-button"
            title={tr('Account settings')}
            aria-label={tr('Account settings')}
            onClick={() => onNavigate('/settings')}
          >
            <Settings size={18} />
          </button>
        </div>
      </section>

      <section className="stats" aria-label={tr('Your record')}>
        <div className="stat">
          <span>
            <Swords size={14} />
            {tr('Battles')}
          </span>
          <strong>{profile.matchesPlayed}</strong>
        </div>
        <div className="stat">
          <span>
            <Trophy size={14} />
            {tr('Wins')}
          </span>
          <strong>{profile.wins}</strong>
        </div>
        <div className="stat">
          <span>
            <Target size={14} />
            {tr('Win rate')}
          </span>
          <strong>{winRate === null ? '—' : `${winRate}%`}</strong>
        </div>
        <div className={`stat ${profile.bestStreak >= 3 ? 'stat--hot' : ''}`}>
          <span>
            <Flame size={14} />
            {tr('Best streak')}
          </span>
          <strong>{profile.bestStreak}</strong>
        </div>
      </section>

      <div className="tabs tabs--block" role="tablist" aria-label={tr('Locker sections')}>
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            role="tab"
            id={`locker-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`locker-panel-${id}`}
            className={tab === id ? 'is-active' : ''}
            onClick={() => setTab(id)}
          >
            {tr(label)}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`locker-panel-${tab}`}
        aria-labelledby={`locker-tab-${tab}`}
        key={tab}
        className="locker-panel"
      >
        {tab === 'loadout' && (
          <>
            <MarkPicker avatar={profile.avatar} store={store} />
            <Customization />
          </>
        )}

        {tab === 'history' && (
          <div className="locker-columns">
            <section className="panel">
              <div className="panel__head">
                <h2>{tr('Battle history')}</h2>
              </div>
              <BattleHistory history={profile.history ?? []} onPlay={() => onNavigate('/play')} />
            </section>

            <section className="panel">
              <div className="panel__head">
                <h2>{tr('Your style')}</h2>
                <Target size={17} />
              </div>
              {favorites.length ? (
                <ul className="topiclist">
                  {favorites.map(([category, count]) => (
                    <li key={category}>
                      <span>{tr(category)}</span>
                      <b className="num">{count}</b>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="dim">{tr('Play a few ranked duels to discover your strengths.')}</p>
              )}
              <div className="record">
                <div>
                  <b className="num">{profile.wins}</b>
                  <span>{tr('wins')}</span>
                </div>
                <div>
                  <b className="num">{profile.losses}</b>
                  <span>{tr('losses')}</span>
                </div>
                <div>
                  <b className="num">{profile.draws}</b>
                  <span>{tr('draws')}</span>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
