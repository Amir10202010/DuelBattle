import { Check, Gift, Sparkles } from 'lucide-react';
import { useEconomy } from '../../hooks/useEconomy.js';
import { CoinIcon } from '../currency/Coins.jsx';
import { Hero } from '../avatar/Hero.jsx';
import { tr, useUiPreferences } from '../../i18n/index.js';

/** What one claim is worth, as the server pays it. */
const DAILY_COINS = 30;
/** The level that unlocks the Stardust aura. */
const STARDUST_LEVEL = 3;

/**
 * The one thing a player can collect without winning.
 *
 * Compact on the home screen, where it is a reminder; full in the store, where
 * it sits beside the things the coins are for. The level unlock underneath is
 * the honest version of a battle pass: a single item, a real requirement, and
 * a bar that shows how close it is.
 */
export function DailyReward({ compact = false }: { compact?: boolean }) {
  useUiPreferences();
  const { data, busy, act, error } = useEconomy();
  if (!data) return null;
  const hasStardust = data.owned.includes('stardust');
  const levelProgress = Math.min(1, data.level / STARDUST_LEVEL);

  return (
    <section className={`daily plate ${compact ? 'daily--compact' : ''}`}>
      <div className="daily__row">
        <span className="daily__art" aria-hidden="true">
          <CoinIcon size={compact ? 44 : 58} />
          <Gift size={compact ? 20 : 26} />
        </span>
        <div className="daily__copy">
          <span className="eyebrow">{tr('Daily drop')}</span>
          <h3>{tr(data.dailyClaimed ? 'Back tomorrow' : 'Free coins, once a day')}</h3>
          <span className="daily__amount">
            <CoinIcon size={17} />
            {DAILY_COINS}
            {tr(' Battle coins')}
          </span>
        </div>
        <button
          className="btn btn--primary"
          disabled={busy || data.dailyClaimed}
          onClick={() => void act('daily')}
        >
          {data.dailyClaimed ? (
            <>
              <Check size={16} />
              {tr('Claimed')}
            </>
          ) : (
            tr('Claim')
          )}
        </button>
      </div>

      {!compact && (
        <div className="daily__unlock">
          <Hero size={92} loadout={{ aura: 'stardust' }} />
          <div>
            <span className="eyebrow">
              <Sparkles size={13} />
              {tr('Level reward')}
            </span>
            <strong>{tr('Stardust aura')}</strong>
            <div
              className="bar bar--thin"
              role="progressbar"
              aria-label={tr('Stardust unlock')}
              aria-valuenow={Math.min(data.level, STARDUST_LEVEL)}
              aria-valuemin={0}
              aria-valuemax={STARDUST_LEVEL}
            >
              <i style={{ width: `${levelProgress * 100}%` }} />
            </div>
            <span className="dim">
              {tr(
                hasStardust
                  ? 'Unlocked. Equip it in your locker.'
                  : `Level ${data.level} of ${STARDUST_LEVEL}`,
              )}
            </span>
          </div>
          <button
            className="btn"
            disabled={data.level < STARDUST_LEVEL || busy || hasStardust}
            onClick={() => void act('buy', 'stardust')}
          >
            {tr(hasStardust ? 'Unlocked' : 'Claim it')}
          </button>
        </div>
      )}

      {error && (
        <p className="error-text" role="alert">
          {tr(error)}
        </p>
      )}
    </section>
  );
}
