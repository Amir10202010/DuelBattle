import { tr } from '../../i18n/index.js';

/**
 * How long until something, the way a person says it: "2d 5h", "5h 12m",
 * "12m". Never seconds — a lobby that ticks every second is a lobby that
 * re-renders every second for nothing.
 */
export function timeLeft(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return tr(`${days}d ${hours}h`);
  if (hours > 0) return tr(`${hours}h ${mins}m`);
  return tr(`${mins}m`);
}
