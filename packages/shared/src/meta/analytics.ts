/**
 * Product events: one list, owned by nobody's vendor.
 *
 * Events are written to the game's own database. The client may report only
 * the names below — things that happen on a screen, which the server cannot
 * see — and the server writes everything that involves money, rewards or a
 * result itself, from its own records. A client event is a hint about
 * behaviour; it is never the source of a number anybody is paid by.
 */

export const CLIENT_EVENTS = [
  'session_start',
  'session_ping',
  'screen_view',
  'play_pressed',
  'queue_joined',
  'queue_cancelled',
  'match_found',
  'match_left',
  'rematch_pressed',
  'store_opened',
  'offer_viewed',
  'checkout_started',
  'checkout_returned',
  'pass_opened',
  'share_pressed',
  'tutorial_step',
  'tutorial_completed',
  'camera_blocked',
  'error_shown',
] as const;

export type ClientEvent = (typeof CLIENT_EVENTS)[number];

export const SERVER_EVENTS = [
  'account_created',
  'match_completed',
  'first_match',
  'first_win',
  'first_loss',
  'level_up',
  'rage_quit',
  'quest_claimed',
  'daily_claimed',
  'pass_tier_claimed',
  'pass_purchased',
  'chest_opened',
  'offer_purchased',
  'purchase_completed',
  'purchase_refunded',
  'currency_earned',
  'currency_spent',
] as const;

export type ServerEvent = (typeof SERVER_EVENTS)[number];

export type EventProps = Record<string, string | number | boolean>;

const KEY = /^[a-z][a-z0-9_]{0,31}$/;

/**
 * What survives into a stored event: at most twelve short, flat properties.
 *
 * Strings are cut to 48 characters and must look like a token — a screen name,
 * an offer id — because a property is never the place for a player's words.
 */
export function sanitizeProps(input: unknown): EventProps {
  const out: EventProps = {};
  if (!input || typeof input !== 'object') return out;
  let kept = 0;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (kept >= 12 || !KEY.test(key)) continue;
    if (typeof value === 'boolean') out[key] = value;
    else if (typeof value === 'number' && Number.isFinite(value)) out[key] = Math.round(value * 1000) / 1000;
    else if (typeof value === 'string' && /^[\w.:/-]{1,48}$/.test(value)) out[key] = value;
    else continue;
    kept++;
  }
  return out;
}

export function isClientEvent(name: unknown): name is ClientEvent {
  return typeof name === 'string' && (CLIENT_EVENTS as readonly string[]).includes(name);
}
