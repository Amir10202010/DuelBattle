import { ArrowRight, ShoppingBag, SlidersHorizontal, Swords, Trophy } from 'lucide-react';
import { levelFor, rankFor, isPlaced, type PublicProfile } from '@battle/shared';
import { rememberMode } from '../../net/playMode.js';
import { useEconomy } from '../../hooks/useEconomy.js';
import { Hero } from './Hero.jsx';
import { CoinCounter } from '../currency/Coins.jsx';
import { LevelBar } from '../Identity.jsx';
import { DailyReward } from '../rewards/DailyReward.jsx';
import { tr, useUiPreferences } from '../../i18n/index.js';
export function GameHub({
  profile,
  onNavigate,
}: {
  profile: PublicProfile;
  onNavigate: (path: string) => void;
}) {
  useUiPreferences();
  const { data, error, feedback, refresh } = useEconomy();
  return (
    <section className="game-hub">
      <div className="hub-identity">
        <span className="eyebrow">{tr('Your hero')}</span>
        <h1>{profile.name}</h1>
        <span className="hub-rank">
          <Trophy size={16} />
          {tr(
            isPlaced(profile.matchesPlayed)
              ? rankFor(profile.rating).label
              : 'Placement in progress',
          )}{' '}
          · {tr('Level')} {levelFor(profile.xp).level}
        </span>
        <LevelBar xp={profile.xp} />
        <div className="hub-wallet">
          {data ? (
            <CoinCounter value={data.coins} />
          ) : error ? (
            <button className="text-link" onClick={refresh}>
              {tr('Load coins')}
            </button>
          ) : (
            <span className="skeleton" aria-label={tr('Loading coins')} />
          )}
        </div>
        <DailyReward compact />
      </div>
      <div className="hub-character">
        <div className="hero-plinth">
          <Hero
            key={feedback?.id ?? 'idle'}
            loadout={data?.loadout ?? profile.loadout}
            pose={feedback && feedback.amount > 0 ? 'victory' : 'idle'}
            size={340}
            label={tr('Your hero')}
          />
        </div>
        <button className="hero-edit" onClick={() => onNavigate('/profile')}>
          <SlidersHorizontal size={17} />
          {tr('Customize')}
        </button>
      </div>
      <div className="hub-play">
        <span className="eyebrow">{tr('Ready when you are')}</span>
        <h2>{tr('One more round?')}</h2>
        <button
          className="btn btn--primary hub-play__button"
          onClick={() => {
            rememberMode('ranked');
            onNavigate('/play');
          }}
        >
          <Swords size={25} />
          {tr('Play')}
          <ArrowRight size={21} />
        </button>
        <button className="hub-store" onClick={() => onNavigate('/store')}>
          <ShoppingBag size={23} />
          <span>
            <strong>{tr('Store')}</strong>
            <small>{tr('Find your next look')}</small>
          </span>
          <ArrowRight size={18} />
        </button>
        <a
          className="text-link"
          href="/leaderboard"
          onClick={(e) => {
            e.preventDefault();
            onNavigate('/leaderboard');
          }}
        >
          <Trophy size={16} />
          {tr('Meet the competition')}
        </a>
      </div>
    </section>
  );
}
