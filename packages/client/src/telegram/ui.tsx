import type { ReactNode } from 'react';
import { ChevronRight, Gem, Loader2 } from 'lucide-react';
import type { TelegramPlayerCard } from '@battle/shared';
import { tr } from '../i18n/index.js';
import { Avatar } from '../components/Identity.jsx';
import { haptics } from './sdk.js';

/**
 * The handful of shapes every Mini App screen is built from.
 *
 * Kept here rather than in each screen so the app has one row, one section
 * heading, one empty state and one way of failing. Everything below composes
 * primitives from system.css; none of it invents a colour or a radius.
 */

export function Section({
  title,
  action,
  onAction,
  children,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  children: ReactNode;
}) {
  return (
    <section className="tg-section">
      <div className="tg-section__head">
        <h2>{tr(title)}</h2>
        {action && onAction && (
          <button type="button" onClick={onAction}>
            {tr(action)}
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * One player, as a tappable row.
 *
 * `onOpen` is optional because the same row is used where there is nowhere to
 * go — a blocked list, a match recap — and a row that looks tappable and is not
 * is worse than a row that does not.
 */
export function PlayerRow({
  player,
  position,
  you = false,
  detail,
  end,
  onOpen,
}: {
  player: TelegramPlayerCard;
  position?: number;
  you?: boolean;
  detail?: string;
  end?: ReactNode;
  onOpen?: () => void;
}) {
  const Tag = onOpen ? 'button' : 'div';
  return (
    <Tag
      {...(onOpen
        ? {
            type: 'button' as const,
            onClick: () => {
              haptics.tap();
              onOpen();
            },
          }
        : {})}
      className={`tg-row ${onOpen ? '' : 'tg-row--flat'} ${you ? 'is-you' : ''}`}
    >
      {position !== undefined && <span className="tg-row__pos">{position}</span>}
      <Avatar avatar={player.avatar} size={34} name={player.name} />
      <span className="tg-row__main">
        <strong>
          {you ? tr('You') : player.name}
          {player.premium && <Gem size={12} aria-label={tr('Premium')} />}
        </strong>
        <span>{detail ?? `${player.rank} · ${player.wins}${tr('W')} ${player.losses}${tr('L')}`}</span>
      </span>
      {end ?? (
        <span className="tg-row__end">
          <b className="num">{player.rating}</b>
          <span>{tr('rating')}</span>
        </span>
      )}
      {onOpen && <ChevronRight size={16} aria-hidden />}
    </Tag>
  );
}

/** An empty state that always offers the next thing to do. */
export function Empty({
  title,
  body,
  action,
  onAction,
}: {
  title: string;
  body: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="blank">
      <p>
        <strong>{tr(title)}</strong>
      </p>
      <p className="dim">{tr(body)}</p>
      {action && onAction && (
        <button type="button" className="btn btn--primary btn--sm" onClick={onAction}>
          {tr(action)}
        </button>
      )}
    </div>
  );
}

export function Loading({ label }: { label?: string }) {
  return (
    <div className="blank" role="status" aria-live="polite">
      <Loader2 className="spin" size={22} aria-hidden />
      <p className="dim">{tr(label ?? 'Loading…')}</p>
    </div>
  );
}

/**
 * A failure with a way out of it.
 *
 * Every asynchronous screen in the Mini App ends up here when it cannot load,
 * and every one of them offers the same retry, because "something went wrong"
 * with no button is the state players close the app from.
 */
export function Failed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="blank" role="alert">
      <p>
        <strong>{tr('That did not load')}</strong>
      </p>
      <p className="dim">{message}</p>
      <button type="button" className="btn btn--primary btn--sm" onClick={onRetry}>
        {tr('Try again')}
      </button>
    </div>
  );
}

export function Switch({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      className="tg-toggle"
      role="switch"
      aria-checked={checked}
      onClick={() => {
        haptics.select();
        onChange(!checked);
      }}
    >
      <span className="tg-toggle__main">
        <strong>{tr(label)}</strong>
        {hint && <span>{tr(hint)}</span>}
      </span>
      <span className={`tg-switch ${checked ? 'is-on' : ''}`} aria-hidden />
    </button>
  );
}

/** A number with a caption, four to a row. Reuses the web app's stat tiles. */
export function StatGrid({ items }: { items: { label: string; value: string; hot?: boolean }[] }) {
  return (
    <div className="stats">
      {items.map((item) => (
        <div key={item.label} className={`stat ${item.hot ? 'stat--hot' : ''}`}>
          <span>{tr(item.label)}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

/** Relative time, in the few words a chat app would use. */
export function when(at: number, now = Date.now()): string {
  const minutes = Math.round((now - at) / 60_000);
  if (minutes < 1) return tr('just now');
  if (minutes < 60) return `${minutes}${tr('m ago')}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}${tr('h ago')}`;
  const days = Math.round(hours / 24);
  return days === 1 ? tr('yesterday') : `${days}${tr('d ago')}`;
}
