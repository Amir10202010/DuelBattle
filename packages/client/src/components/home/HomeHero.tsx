import { useState } from 'react';
import { ArrowRight, Shirt, Swords, Users, WifiOff } from 'lucide-react';
import { isPlaced, rankFor, type PublicProfile } from '@battle/shared';
import { rememberMode, rememberedMode, type PlayMode } from '../../net/playMode.js';
import { rememberedName, type MatchStore } from '../../net/store.js';
import { useEconomy } from '../../hooks/useEconomy.js';
import { tr, useUiPreferences } from '../../i18n/index.js';
import { Hero } from '../avatar/Hero.jsx';
import { CoinCounter } from '../currency/Coins.jsx';
import { LevelBar } from '../Identity.jsx';
import { RankEmblem } from '../GameArt.jsx';
import { ModePicker } from '../play/ModePicker.jsx';

/**
 * The first thing a signed-in player sees, and the shortest path back into a
 * match.
 *
 * Pressing battle here does not open a menu: it picks the mode already chosen,
 * enters the queue, and moves to the searching screen. The old route asked for
 * the same decision twice — once here and once on the battle screen — which is
 * two taps and a page load between wanting to play and playing.
 */
export function HomeHero({
  profile,
  store,
  offline,
  onNavigate,
}: {
  profile: PublicProfile;
  store: MatchStore;
  offline: boolean;
  onNavigate: (path: string) => void;
}) {
  useUiPreferences();
  const { data: economy, feedback } = useEconomy();
  const [mode, setMode] = useState<PlayMode>(rememberedMode);
  const placed = isPlaced(profile.matchesPlayed);
  const rank = rankFor(profile.rating);
  const last = profile.history?.[0];

  const chooseMode = (next: PlayMode) => {
    setMode(next);
    rememberMode(next);
  };

  const play = () => {
    const name = profile.name || rememberedName();
    onNavigate('/play');
    // A name the server has never seen has to be asked for, and the battle
    // screen is where that field lives.
    if (!offline && name) store.findMatch(name, mode);
  };

  return (
    <section className="hero-band plate">
      <div className="hero-band__id">
        <h1 className="hero-band__name display">{profile.name || tr('New player')}</h1>
        <span className={`hero-band__rank ${placed ? '' : 'is-placing'}`}>
          <RankEmblem rating={profile.rating} size={30} placing={!placed} />
          {tr(placed ? rank.label : 'Placement in progress')}
        </span>
        <LevelBar xp={profile.xp} />
        <div className="hero-band__wallet">
          {economy ? (
            <CoinCounter value={economy.coins} />
          ) : (
            <span className="skel hero-band__wallet-skel" aria-hidden="true" />
          )}
        </div>
      </div>

      <div className="hero-band__char">
        <div className="hero-plinth">
          <Hero
            key={feedback?.id ?? 'idle'}
            loadout={economy?.loadout ?? profile.loadout}
            pose={feedback && feedback.amount > 0 ? 'victory' : 'idle'}
            size={330}
            label={tr('Your hero')}
          />
        </div>
        <button className="btn btn--sm hero-band__dress" onClick={() => onNavigate('/profile')}>
          <Shirt size={15} />
          {tr('Customise')}
        </button>
      </div>

      <div className="hero-band__play">
        <ModePicker value={mode} onChange={chooseMode} canRank />
        <button className="playbutton" onClick={play} disabled={offline}>
          <Swords size={24} strokeWidth={2.4} aria-hidden="true" />
          <span>{tr('Battle')}</span>
          <ArrowRight size={20} aria-hidden="true" />
        </button>
        {offline && (
          <p className="hero-band__note is-bad" role="status">
            <WifiOff size={14} />
            {tr('Reconnecting to the arena…')}
          </p>
        )}
        <button className="hero-band__friend" onClick={() => onNavigate('/play')}>
          <Users size={17} />
          <span>
            <strong>{tr('Play a friend')}</strong>
            <small>{tr('Private room · your own prompts')}</small>
          </span>
          <ArrowRight size={16} />
        </button>
        {last && (
          <p className={`hero-band__last is-${last.result}`}>
            <i aria-hidden="true" />
            {tr(
              last.result === 'win'
                ? `Last battle: you beat ${last.opponentName} ${last.yourScore}–${last.theirScore}`
                : last.result === 'loss'
                  ? `Last battle: ${last.opponentName} won ${last.theirScore}–${last.yourScore}`
                  : `Last battle: a draw with ${last.opponentName}`,
            )}
          </p>
        )}
      </div>
    </section>
  );
}
