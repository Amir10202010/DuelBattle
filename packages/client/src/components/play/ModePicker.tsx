import { Trophy, Zap } from 'lucide-react';
import { tr, useUiPreferences } from '../../i18n/index.js';
import type { PlayMode } from '../../net/playMode.js';

/**
 * Which kind of duel you are about to start.
 *
 * Both screens that can start a match use this one control, so the choice a
 * player makes on the home screen is the same object they see on the battle
 * screen — and it is worded as stakes (rewards without a rating, against a
 * rating on top), because that is the only difference that matters to them.
 */
export function ModePicker({
  value,
  onChange,
  canRank,
  disabled = false,
}: {
  value: PlayMode;
  onChange: (mode: PlayMode) => void;
  /** Ranked needs an account; guests are offered the way to get one. */
  canRank: boolean;
  disabled?: boolean;
}) {
  useUiPreferences();
  return (
    <div className="modes" role="group" aria-label={tr('Game mode')}>
      <button
        type="button"
        className={`modes__pick plate ${value === 'casual' ? 'is-active' : ''}`}
        aria-pressed={value === 'casual'}
        disabled={disabled}
        onClick={() => onChange('casual')}
      >
        <Zap size={19} aria-hidden="true" />
        <strong>{tr('Quick play')}</strong>
        <small>{tr(canRank ? 'XP · coins · no rating' : 'Nothing to lose')}</small>
        {canRank && <small>{tr('Rewards when both players are signed in')}</small>}
      </button>
      {canRank ? (
        <button
          type="button"
          className={`modes__pick plate ${value === 'ranked' ? 'is-active' : ''}`}
          aria-pressed={value === 'ranked'}
          disabled={disabled}
          onClick={() => onChange('ranked')}
        >
          <Trophy size={19} aria-hidden="true" />
          <strong>{tr('Ranked')}</strong>
          <small>{tr('Rating · more of everything')}</small>
        </button>
      ) : (
        <a className="modes__pick modes__pick--locked plate" href="/register">
          <Trophy size={19} aria-hidden="true" />
          <strong>{tr('Ranked')}</strong>
          <small>{tr('Create a player to climb')}</small>
        </a>
      )}
    </div>
  );
}
