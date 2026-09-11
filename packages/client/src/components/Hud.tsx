import { memo } from 'react';
import type { PublicMatchState, PublicPlayer } from '@battle/shared';
import type { ConnectionStatus } from '../net/connection.js';
import type { Toast } from '../net/store.js';

interface TimerBarProps {
  /** Server-clock deadline. */
  endsAt: number | null;
  /** Milliseconds the full bar represents. */
  totalMs: number;
  now: number;
  label?: string;
}

/**
 * A drain bar plus the number of seconds left. Both are shown because the bar
 * reads at a glance mid-round and the number is what people shout at each other.
 */
export const TimerBar = memo(function TimerBar({ endsAt, totalMs, now, label }: TimerBarProps) {
  if (endsAt === null) return null;
  const remaining = Math.max(0, endsAt - now);
  const fraction = totalMs > 0 ? Math.min(1, remaining / totalMs) : 0;
  const seconds = remaining / 1000;
  const urgent = remaining <= 5_000;

  return (
    <div className={`timer ${urgent ? 'timer--urgent' : ''}`}>
      <div className="timer__track">
        <div className="timer__fill" style={{ transform: `scaleX(${fraction})` }} />
      </div>
      <span className="timer__value mono" role="timer" aria-live="off">
        {seconds < 10 ? seconds.toFixed(1) : Math.ceil(seconds)}s
      </span>
      {label && <span className="timer__label eyebrow">{label}</span>}
    </div>
  );
});

interface ScoreStripProps {
  match: PublicMatchState;
  youId: string | null;
}

/** Round wins as pips, so the state of the match reads without counting. */
export const ScoreStrip = memo(function ScoreStrip({ match, youId }: ScoreStripProps) {
  const seats = match.seats.map((id) => (id ? match.players[id] ?? null : null));
  const target = match.settings.winTarget;

  return (
    <div className="scorestrip">
      {seats.map((player, index) => (
        <div key={index} className={`scorestrip__side scorestrip__side--seat${index}`}>
          <span className="scorestrip__name">
            {player?.name ?? '—'}
            {player && player.id === youId && <span className="scorestrip__you">you</span>}
          </span>
          <span className="scorestrip__pips" aria-hidden="true">
            {Array.from({ length: target }, (_, i) => (
              <i key={i} className={i < (player?.score ?? 0) ? 'is-won' : ''} />
            ))}
          </span>
          <span className="scorestrip__score mono">{player?.score ?? 0}</span>
          <span className="sr-only">
            {player?.name ?? 'empty seat'} has {player?.score ?? 0} of {target} rounds
          </span>
        </div>
      ))}
    </div>
  );
});

interface ConnectionBadgeProps {
  status: ConnectionStatus;
  latencyMs: number | null;
}

export const ConnectionBadge = memo(function ConnectionBadge({
  status,
  latencyMs,
}: ConnectionBadgeProps) {
  if (status === 'open') {
    return (
      <span className="conn conn--ok" title={latencyMs === null ? undefined : `${latencyMs}ms`}>
        <i aria-hidden="true" />
        <span className="sr-only">Connected</span>
      </span>
    );
  }
  const copy = status === 'offline' ? 'Disconnected' : 'Reconnecting…';
  return (
    <span className="conn conn--bad" role="status">
      <i aria-hidden="true" />
      {copy}
    </span>
  );
});

interface ToastsProps {
  toasts: Toast[];
}

export const Toasts = memo(function Toasts({ toasts }: ToastsProps) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.kind}`}>
          {toast.message}
        </div>
      ))}
    </div>
  );
});

interface PausedOverlayProps {
  paused: NonNullable<PublicMatchState['paused']>;
  now: number;
  opponent: PublicPlayer | null;
}

export const PausedOverlay = memo(function PausedOverlay({
  paused,
  now,
  opponent,
}: PausedOverlayProps) {
  const remaining = Math.max(0, paused.deadline - now);
  return (
    <div className="overlay overlay--paused" role="alertdialog" aria-label="Match paused">
      <div className="overlay__inner">
        <p className="eyebrow">Match paused</p>
        <h2 className="display overlay__title">
          {opponent ? `${opponent.name} dropped out` : 'Waiting for your opponent'}
        </h2>
        <p className="dim">
          The clock is frozen. If they are not back in {Math.ceil(remaining / 1000)}s the match ends
          here.
        </p>
      </div>
    </div>
  );
});
