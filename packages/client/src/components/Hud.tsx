import { tr, useUiPreferences } from '../i18n/index.js';
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
  useUiPreferences();
  if (endsAt === null) return null;
  const remaining = Math.max(0, endsAt - now);
  const fraction = totalMs > 0 ? Math.min(1, remaining / totalMs) : 0;
  const seconds = remaining / 1000;
  const urgent = !label && remaining <= 5_000;

  return (
    <div className={`timer ${urgent ? 'timer--urgent' : ''}`}>
      <div className="timer__track">
        <div className="timer__fill" style={{ transform: `scaleX(${fraction})` }} />
      </div>
      <span className="timer__value mono" role="timer" aria-live="off">
        {tr(seconds < 10 ? seconds.toFixed(1) : Math.ceil(seconds))}
        {tr('s')}
      </span>
      {label && <span className="timer__label eyebrow">{tr(label)}</span>}
    </div>
  );
});

interface ScoreStripProps {
  match: PublicMatchState;
  youId: string | null;
}

/**
 * The scoreboard: one object, not two cards side by side.
 *
 * A duel has a single score — "two, one" — and reading it used to mean reading
 * two separate panels and doing the subtraction yourself. Here the two sides
 * share a bar and meet in the middle at the number they are both racing to, so
 * the state of the match lands in one glance: who is ahead, by how much, and
 * how close either of them is to finishing it.
 *
 * Round wins are segments rather than dots, filling towards the centre. One win
 * from the end, a side starts flashing match point, which is the moment the
 * whole match changes shape and the only one worth shouting about.
 */
export const ScoreStrip = memo(function ScoreStrip({ match, youId }: ScoreStripProps) {
  useUiPreferences();
  const ordered = youId && match.seats.includes(youId)
    ? [youId, ...match.seats.filter((id) => id !== youId)]
    : match.seats;
  const seats = ordered.map((id) => (id ? (match.players[id] ?? null) : null));
  const target = match.settings.winTarget;
  const scores = seats.map((player) => player?.score ?? 0);
  const best = Math.max(...scores);

  return (
    <div className="scorestrip" role="group" aria-label={tr('Match score')}>
      {seats.map((player, index) => {
        const score = scores[index] ?? 0;
        const won = match.phase === 'roundResult' && match.round?.outcome?.winnerId === player?.id;
        const classes = [
          'scorestrip__side',
          `scorestrip__side--seat${index}`,
          score === best && score > (scores[index === 0 ? 1 : 0] ?? 0) ? 'is-lead' : '',
          score === target - 1 ? 'is-matchpoint' : '',
          won ? 'is-scoring' : '',
        ].filter(Boolean).join(' ');

        return (
          <div key={index} className={classes} data-player={player?.id}>
            <span className="scorestrip__name">
              {player?.name ?? '—'}
              {player && player.id === youId && (
                <span className="scorestrip__you">{tr('you')}</span>
              )}
            </span>
            <span className="scorestrip__pips" aria-hidden="true">
              {Array.from({ length: target }, (_, i) => (
                <i
                  key={i}
                  className={`${i < score ? 'is-won' : ''} ${won && i === score - 1 ? 'is-earned' : ''}`}
                />
              ))}
            </span>
            <span key={score} className="scorestrip__score">
              {score}
            </span>
            <span className="sr-only">
              {player?.name ?? tr('Empty seat')}: {score} / {target}
            </span>
          </div>
        );
      })}

      {/* What both sides are racing to, once, between them. */}
      <div className="scorestrip__target" aria-hidden="true">
        <b>{target}</b>
        <span>{tr(scores.some((score) => score === target - 1) ? 'Match point' : 'to win')}</span>
      </div>
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
  useUiPreferences();
  if (status === 'open') {
    return (
      <span className={`conn ${latencyMs !== null && latencyMs >= 250 ? 'conn--slow' : 'conn--ok'}`} title={tr(latencyMs !== null && latencyMs >= 250 ? 'Connection is slow. Your answer may take longer to confirm.' : 'Connected')}>
        <i aria-hidden="true" />
        <span className="sr-only">{tr('Connected')}</span>
        {latencyMs !== null && <span className="conn__latency">{latencyMs} ms</span>}
      </span>
    );
  }
  const copy = status === 'offline' ? 'Disconnected' : 'Reconnecting…';
  return (
    <span className="conn conn--bad" role="status">
      <i aria-hidden="true" />
      {tr(copy)}
    </span>
  );
});

interface ToastsProps {
  toasts: Toast[];
}

export const Toasts = memo(function Toasts({ toasts }: ToastsProps) {
  useUiPreferences();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.kind}`}>
          {tr(toast.message)}
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
  useUiPreferences();
  const remaining = Math.max(0, paused.deadline - now);
  return (
    <div className="overlay overlay--paused" role="alertdialog" aria-label={tr('Match paused')}>
      <div className="overlay__inner">
        <p className="eyebrow">{tr('Match paused')}</p>
        <h2 className="display overlay__title">
          {tr(opponent ? `${opponent.name} dropped out` : 'Waiting for your opponent')}
        </h2>
        <p className="dim">{tr(`Reconnecting · ${Math.ceil(remaining / 1000)} sec left`)}</p>
      </div>
    </div>
  );
});
