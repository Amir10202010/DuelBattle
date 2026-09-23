import { memo } from 'react';
import { isPlaced, rankFor, type PublicMatchState, type PublicProfile } from '@battle/shared';
import { Hero } from '../avatar/Hero.jsx';
import { tr, useUiPreferences } from '../../i18n/index.js';

/** A real opponent introduction, part of the lobby so readiness is never delayed. */
export const VersusIntro = memo(function VersusIntro({ match, youId, standings, arriving }: {
  match: PublicMatchState; youId: string; standings: Record<string, PublicProfile>; arriving: boolean;
}) {
  useUiPreferences();
  const ids = [youId, ...match.seats.filter((id): id is string => Boolean(id && id !== youId))];
  return <section className={`versus-intro ${arriving ? 'is-arriving' : ''}`} aria-label={tr('Your matchup')}>
    {ids.map((id, index) => {
      const player = match.players[id];
      const profile = standings[id];
      return <div key={id} className={`versus-intro__fighter versus-intro__fighter--${index}`}>
        <div className="versus-intro__portrait"><Hero loadout={profile?.loadout} size={112} portrait animated={arriving} /></div>
        <div className="versus-intro__identity">
          <span className="eyebrow">{tr(index === 0 ? 'You' : 'Your rival')}</span>
          <strong>{player?.name}</strong>
          <span>{profile ? `${tr(isPlaced(profile.matchesPlayed) ? rankFor(profile.rating).label : 'Placement')} · ${profile.rating}` : tr('Quick play')}</span>
        </div>
      </div>;
    })}
    <div className="versus-intro__seal" aria-hidden="true">VS</div>
  </section>;
});
