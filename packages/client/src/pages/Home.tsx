import { ArrowRight, Flame, Trophy, Swords } from 'lucide-react';
import { nextRank, type PublicProfile } from '@battle/shared';
import type { BoardState } from '../net/store.js';
import { tr, useUiPreferences } from '../i18n/index.js';
import { GameHub } from '../components/avatar/GameHub.jsx';
import { BattleHistory } from '../components/BattleHistory.jsx';
import { RankEmblem } from '../components/GameArt.jsx';

export function Home({
  profile,
  board,
  onNavigate,
}: {
  profile: PublicProfile;
  board: BoardState | null;
  now?: number;
  onNavigate: (path: string) => void;
}) {
  useUiPreferences();
  const next = nextRank(profile.rating);
  return (
    <main className="page dashboard">
      <GameHub profile={profile} onNavigate={onNavigate} />
      <section className="home-stats">
        <div>
          <span>
            <Swords size={17} />
            {tr('Battles')}
          </span>
          <strong>{profile.matchesPlayed}</strong>
        </div>
        <div>
          <span>
            <Trophy size={17} />
            {tr('Wins')}
          </span>
          <strong>{profile.wins}</strong>
        </div>
        <div>
          <span>
            <Flame size={17} />
            {tr('Streak')}
          </span>
          <strong>{profile.streak}</strong>
        </div>
        <div>
          <span>{tr('Rating')}</span>
          <strong>{profile.rating}</strong>
        </div>
      </section>
      <div className="home-secondary">
        <section className="panel">
          <div className="card-heading">
            <h2>{tr('Recent battles')}</h2>
            <button className="text-link" onClick={() => onNavigate('/profile')}>
              {tr('Your record')}
              <ArrowRight size={15} />
            </button>
          </div>
          <BattleHistory
            history={(profile.history ?? []).slice(0, 4)}
            onPlay={() => onNavigate('/play')}
          />
        </section>
        <section className="panel hub-next-rank">
          <div className="card-heading">
            <h2>{tr('Next rank')}</h2>
            <RankEmblem rating={next?.rank.floor ?? profile.rating} size={74} />
          </div>
          <p>{tr(next?.rank.label ?? 'Top rank')}</p>
          <strong>{next ? `${next.pointsAway} MMR` : tr('Keep your crown')}</strong>
          <button className="text-link" onClick={() => onNavigate('/ranks')}>
            {tr('View rank ladder')}
            <ArrowRight size={15} />
          </button>
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
        </div>
        <button className="text-link" onClick={() => onNavigate('/leaderboard')}>
          {tr('Meet the competition')}
          <ArrowRight size={16} />
        </button>
      </section>
    </main>
  );
}
