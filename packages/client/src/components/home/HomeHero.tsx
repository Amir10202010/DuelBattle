import { useState, type CSSProperties } from 'react';
import { ArrowRight, Shirt, Swords, Users, WifiOff } from 'lucide-react';
import { isPlaced, rankFor, type PublicProfile } from '@battle/shared';
import { rememberMode, rememberedMode, type PlayMode } from '../../net/playMode.js';
import { rememberedName, type MatchStore } from '../../net/store.js';
import { useEconomy } from '../../hooks/useEconomy.js';
import { tr, useUiPreferences } from '../../i18n/index.js';
import { track } from '../../analytics.js';
import { Hero } from '../avatar/Hero.jsx';
import { LevelBar } from '../Identity.jsx';
import { RankEmblem } from '../GameArt.jsx';
import { ModePicker } from '../play/ModePicker.jsx';
import { PlayerPlate } from '../meta/PlayerPlate.jsx';

/** Floating motes over the stage: a handful, drawn by CSS, paused off screen. */
const MOTES = Array.from({ length: 9 }, (_, i) => i);

/**
 * The first thing a signed-in player sees, and the shortest path back into a
 * match.
 *
 * Pressing battle here does not open a menu: it picks the mode already chosen,
 * enters the queue, and moves to the searching screen. The button says what
 * the match is worth before it is played, because "why should I press this"
 * is the only question this screen exists to answer.
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
  const loadout = economy?.loadout ?? profile.loadout;

  const chooseMode = (next: PlayMode) => {
    setMode(next);
    rememberMode(next);
  };

  const play = () => {
    const name = profile.name || rememberedName();
    track('play_pressed', { mode, from: 'home' });
    onNavigate('/play');
    // A name the server has never seen has to be asked for, and the battle
    // screen is where that field lives.
    if (!offline && name) store.findMatch(name, mode);
  };

  return (
    <section className="stage-card plate" aria-label={tr('Your arena')}>
      <header className="stage-card__id">
        <PlayerPlate name={profile.name || tr('New player')} loadout={loadout} className="stage-card__plate">
          <span className={`stage-card__rank ${placed ? '' : 'is-placing'}`}>
            <RankEmblem rating={profile.rating} size={26} placing={!placed} />
            {tr(placed ? rank.label : 'Placement in progress')}
          </span>
        </PlayerPlate>
        <LevelBar xp={profile.xp} />
      </header>

      <div className="stage-card__stage">
        <span className="stage-card__spot" aria-hidden="true" />
        <span className="stage-card__floor" aria-hidden="true" />
        <span className="stage-card__motes" aria-hidden="true">
          {MOTES.map((i) => (
            <i key={i} style={{ '--i': i } as CSSProperties} />
          ))}
        </span>
        <div className="stage-card__hero">
          <Hero
            key={feedback?.id ?? 'idle'}
            loadout={loadout}
            pose={feedback && feedback.amount > 0 ? 'victory' : 'idle'}
            size={300}
            label={tr('Your hero')}
          />
        </div>
        <button className="btn btn--sm stage-card__dress" onClick={() => onNavigate('/profile')}>
          <Shirt size={15} />
          {tr('Customise')}
        </button>
      </div>

      <div className="stage-card__play">
        <ModePicker value={mode} onChange={chooseMode} canRank />
        <button className="playbutton playbutton--hero" onClick={play} disabled={offline}>
          <Swords size={28} strokeWidth={2.4} aria-hidden="true" />
          <span className="playbutton__label">
            <b>{tr('Battle')}</b>
            <small>{tr(mode === 'ranked' ? 'Rating · XP · coins · pass' : 'XP · coins · pass · quests')}</small>
          </span>
          <ArrowRight size={22} aria-hidden="true" />
        </button>
        {offline && (
          <p className="stage-card__note is-bad" role="status">
            <WifiOff size={14} />
            {tr('Reconnecting to the arena…')}
          </p>
        )}
        <button
          className="stage-card__friend"
          disabled={offline}
          onClick={() => {
            track('play_pressed', { mode: 'friend', from: 'home' });
            onNavigate('/play');
            const name = profile.name || rememberedName();
            if (name && !offline) store.createRoom(name);
          }}
        >
          <Users size={17} />
          <span>
            <strong>{tr('Play a friend')}</strong>
            <small>{tr('Private room · your own prompts')}</small>
          </span>
          <ArrowRight size={16} />
        </button>
        {last && (
          <p className={`stage-card__last is-${last.result}`}>
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
