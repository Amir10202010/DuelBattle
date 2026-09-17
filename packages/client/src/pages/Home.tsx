import { ArrowRight, Flame, Gem, Target, Trophy, Swords } from 'lucide-react';
import { isPlaced, nextRank, rankFor, type PublicProfile } from '@battle/shared';
import type { BoardState, MatchStore } from '../net/store.js';
import { tr, useUiPreferences } from '../i18n/index.js';
import { HomeHero } from '../components/home/HomeHero.jsx';
import { BattleHistory } from '../components/BattleHistory.jsx';
import { DailyReward } from '../components/rewards/DailyReward.jsx';
import { RankEmblem } from '../components/GameArt.jsx';

/**
 * Home is the game, not an account page.
 *
 * Top band: who you are, the hero you dressed, and the one button that starts
 * a match. Below it, only things that answer "did that matter?" — your record,
 * how far the next rung is, where you sit on the ladder, and today's coins.
 * Anything that is a setting lives in settings.
 */
export function Home({
  profile,
  board,
  store,
  offline,
  onNavigate,
}: {
  profile: PublicProfile;
  board: BoardState | null;
  store: MatchStore;
  offline: boolean;
  onNavigate: (path: string) => void;
}) {
  useUiPreferences();
  const next = nextRank(profile.rating);
  const placed = isPlaced(profile.matchesPlayed);
  const rank = rankFor(profile.rating);
  const winRate = profile.matchesPlayed
    ? Math.round((profile.wins / profile.matchesPlayed) * 100)
    : null;

  return (
    <main className="page home">
      <HomeHero profile={profile} store={store} offline={offline} onNavigate={onNavigate} />

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
        <div className={`stat ${profile.streak >= 3 ? 'stat--hot' : ''}`}>
          <span>
            <Flame size={14} />
            {tr('Streak')}
          </span>
          <strong>{profile.streak}</strong>
        </div>
        <div className="stat">
          <span>
            <Gem size={14} />
            {tr('Rating')}
          </span>
          <strong>{profile.rating}</strong>
        </div>
      </section>

      <div className="home__grid">
        <section className="panel">
          <div className="panel__head">
            <h2>{tr('Recent battles')}</h2>
            <button className="text-link" onClick={() => onNavigate('/profile')}>
              {tr('Full record')}
              <ArrowRight size={15} />
            </button>
          </div>
          <BattleHistory
            history={(profile.history ?? []).slice(0, 5)}
            onPlay={() => onNavigate('/play')}
          />
        </section>

        <div className="home__aside">
          <section className="panel climb">
            <div className="panel__head">
              <h2>{tr(next ? 'Next rank' : 'Top rank')}</h2>
              <span className="eyebrow">{tr(placed ? rank.label : 'Placement')}</span>
            </div>
            <div className="climb__body">
              <RankEmblem rating={next?.rank.floor ?? profile.rating} size={74} />
              <div>
                <strong>{tr(next?.rank.label ?? 'Household Name')}</strong>
                <span className="dim">
                  {tr(
                    next
                      ? `${next.pointsAway} rating to go`
                      : 'Nothing above you. Defend it.',
                  )}
                </span>
              </div>
            </div>
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
            <button className="text-link" onClick={() => onNavigate('/ranks')}>
              {tr('See the ladder')}
              <ArrowRight size={15} />
            </button>
          </section>

          <button className="ladder-teaser" onClick={() => onNavigate('/leaderboard')}>
            <Trophy size={20} />
            <span>
              <strong className="num">
                {board?.you ? `#${board.you.position}` : '—'}
              </strong>
              <small>
                {tr(
                  board?.you
                    ? 'Your place on the ladder'
                    : 'Finish placement to join the ladder',
                )}
              </small>
            </span>
            <ArrowRight size={17} />
          </button>

          <DailyReward compact />
        </div>
      </div>
    </main>
  );
}
