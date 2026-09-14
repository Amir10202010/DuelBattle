import { tr, useUiPreferences } from '../i18n/index.js';
import { ArrowRight, ChevronRight, Flame, Trophy, Zap, ShieldCheck, Target } from 'lucide-react';
import {
  ACHIEVEMENTS,
  achievementOrder,
  isPlaced,
  nextRank,
  rankFor,
  type PublicProfile,
} from '@battle/shared';
import { LevelBar } from '../components/Identity.jsx';
import { MugArt, RankEmblem, RewardArt } from '../components/GameArt.jsx';
import type { BoardState } from '../net/store.js';
import { rememberMode } from '../net/playMode.js';
import { BattleHistory } from '../components/BattleHistory.jsx';

export function Home({
  profile,
  board,
  now = Date.now(),
  onNavigate,
}: {
  profile: PublicProfile;
  board: BoardState | null;
  now?: number;
  onNavigate: (path: string) => void;
}) {
  useUiPreferences();
  const placed = isPlaced(profile.matchesPlayed);
  const rank = rankFor(profile.rating);
  const next = nextRank(profile.rating);
  const dailyDone = (profile.history ?? []).some(
    (r) =>
      (r.dailyBonus ?? 0) > 0 &&
      new Date(r.at).toISOString().slice(0, 10) === new Date(now).toISOString().slice(0, 10),
  );
  const chasing = achievementOrder(profile, profile.achievements)
    .filter((a) => !profile.achievements.includes(a.id))
    .sort((a, b) =>
      profile.matchesPlayed === 0 ? Number(b.group === 'first') - Number(a.group === 'first') : 0,
    )
    .slice(0, 3);
  return (
    <main className="page dashboard">
      <header className="page-heading">
        <div>
          <span className="eyebrow">{tr('Your next good rivalry')}</span>
          <h1>
            {tr(profile.matchesPlayed ? 'Welcome back' : 'Welcome to the arena')}
            {', '}
            {profile.name}
            {'.'}
          </h1>
          <p>
            {tr(
              profile.streak >= 2
                ? `${profile.streak} wins in a row. Give them something to remember.`
                : 'A new challenger. A familiar room. Make it count.',
            )}
          </p>
        </div>
        <span className="status-tag">
          <ShieldCheck size={14} />
          {tr(' Fair play, always')}
        </span>
      </header>
      <div className="home-grid">
        <section className="battle-banner">
          <div className="battle-banner__copy">
            <span className="eyebrow">{tr('Quick play · 1 vs 1')}</span>
            <h2>
              {tr('Every room')}
              <br />
              {tr('has a ')}
              <em>{tr('champion.')}</em>
            </h2>
            <p>
              {tr('Find your rival. Show your answer.')}
              <br />
              {tr('Let your reflexes do the talking.')}
            </p>
            <button className="btn btn--primary btn--lg" onClick={() => onNavigate('/play')}>
              <Zap size={18} fill="currentColor" />
              {tr(' Find a battle ')}
              <ArrowRight size={17} />
            </button>
            <span className="battle-banner__note">{tr('Find it. Show it. First to 3 wins.')}</span>
          </div>
          <div className="battle-banner__art">
            <MugArt />
            <span className="floating-tag">
              <ShieldCheck size={14} />
              {tr(' Room for a win.')}
            </span>
          </div>
        </section>
        <section className="rank-card">
          <div className="card-heading">
            <span className="eyebrow">{tr('Your standing')}</span>
            <a
              className="icon-link"
              href="/ranks"
              aria-label={tr('View rank ladder')}
              onClick={(e) => {
                e.preventDefault();
                onNavigate('/ranks');
              }}
            >
              <ArrowRight size={17} />
            </a>
          </div>
          <RankEmblem rating={profile.rating} size={112} placing={!placed} />
          <h2>{tr(placed ? rank.label : 'Finding your rank')}</h2>
          <div className="rank-number">
            {tr(profile.rating.toLocaleString())} <span>{tr('MMR')}</span>
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-label={tr(placed ? 'Next rank' : 'Placement matches')}
            aria-valuenow={placed ? Math.round(rank.progress * 100) : profile.matchesPlayed}
            aria-valuemin={0}
            aria-valuemax={placed ? 100 : 5}
          >
            <i
              style={{
                width: `${placed ? rank.progress * 100 : (profile.matchesPlayed / 5) * 100}%`,
              }}
            />
          </div>
          <p>
            {tr(
              placed
                ? next
                  ? `${next.pointsAway} MMR to ${tr(next.rank.label)}`
                  : 'A household name. Defend it.'
                : `${profile.matchesPlayed} of 5 placement matches`,
            )}
          </p>
        </section>
        <section className="home-stats" aria-label={tr('Your record')}>
          {[
            {
              Icon: Trophy,
              label: 'Victories',
              value: profile.wins,
              note: `${profile.matchesPlayed} matches played`,
            },
            {
              Icon: Flame,
              label: 'Win streak',
              value: profile.streak,
              note: `Personal best: ${profile.bestStreak}`,
            },
            {
              Icon: Target,
              label: 'Win rate',
              value: profile.matchesPlayed
                ? `${Math.round((profile.wins / profile.matchesPlayed) * 100)}%`
                : '—',
              note: 'Lifetime ranked record',
            },
            {
              Icon: Zap,
              label: 'XP earned',
              value: profile.xp.toLocaleString(),
              note: `${profile.achievements.length} achievements unlocked`,
            },
          ].map(({ Icon, label, value, note }) => (
            <div key={label}>
              <span>
                <Icon size={17} />
                {tr(label)}
              </span>
              <strong>{tr(value)}</strong>
              <small>{tr(note)}</small>
            </div>
          ))}
        </section>
        <section className="panel daily-card">
          <div className="card-heading">
            <span className="eyebrow">{tr('Daily challenge')}</span>
            <span className={`status-tag ${dailyDone ? 'is-good' : ''}`}>
              {tr(dailyDone ? 'Completed' : '+75 XP')}
            </span>
          </div>
          <div className="daily-card__body">
            <span className="daily-icon">
              <Target size={32} />
            </span>
            <div>
              <h3>{tr('Show up. Show off.')}</h3>
              <p>{tr('Finish your first eligible ranked match today.')}</p>
            </div>
          </div>
          <div className="card-heading">
            <small>{tr('Resets at 00:00 UTC · Automatically awarded')}</small>
            <button
              className="text-link"
              onClick={() => {
                rememberMode('ranked');
                onNavigate('/play');
              }}
            >
              {tr(dailyDone ? 'Play again' : 'Take the challenge')}
              <ChevronRight size={16} />
            </button>
          </div>
        </section>
        <section className="panel home-level">
          <div className="card-heading">
            <span className="eyebrow">{tr('Keep the momentum')}</span>
            <span className="small-number">
              {tr(profile.xp.toLocaleString())}
              {tr(' XP')}
            </span>
          </div>
          <LevelBar xp={profile.xp} />
          <p>{tr('Every eligible duel builds your level. Even the ones you lose.')}</p>
        </section>
      </div>
      <div className="home-secondary">
        <section className="panel">
          <div className="card-heading">
            <h2>{tr('Recent battles')}</h2>
            <button className="text-link" onClick={() => onNavigate('/profile')}>
              {tr('Your record ')}
              <ArrowRight size={15} />
            </button>
          </div>
          <BattleHistory
            history={(profile.history ?? []).slice(0, 4)}
            onPlay={() => onNavigate('/play')}
          />
        </section>
        <section className="panel">
          <div className="card-heading">
            <h2>{tr('Something to chase')}</h2>
            <span className="dim">
              {tr(profile.achievements.length)}
              {'/'}
              {tr(ACHIEVEMENTS.length)}
            </span>
          </div>
          <div className="reward-preview">
            {chasing.map((award) => (
              <button key={award.id} onClick={() => onNavigate('/awards')}>
                <RewardArt group={award.group} rarity={award.rarity} locked />
                <span>
                  <strong>{tr(award.name)}</strong>
                  <small>{tr(award.description)}</small>
                </span>
                <b>
                  {'+'}
                  {tr(award.xp)}
                </b>
              </button>
            ))}
            {chasing.length === 0 && <p>{tr('You have collected them all. Defend your rank.')}</p>}
          </div>
        </section>
      </div>
      <section className="board-teaser">
        <div>
          <Trophy size={21} />
          <strong>
            {tr(
              board?.you
                ? `You’re #${board.you.position} on the ladder.`
                : 'Make your way onto the ladder.',
            )}
          </strong>
          <span>
            {tr(
              board?.total
                ? `${board.total} ranked players. One spot with your name on it.`
                : 'Five placement matches open your first chapter.',
            )}
          </span>
        </div>
        <button className="text-link" onClick={() => onNavigate('/leaderboard')}>
          {tr('Meet the competition ')}
          <ArrowRight size={15} />
        </button>
      </section>
    </main>
  );
}
