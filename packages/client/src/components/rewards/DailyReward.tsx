import { Gift, Check, Sparkles } from 'lucide-react';
import { useEconomy } from '../../hooks/useEconomy.js';
import { CoinIcon } from '../currency/Coins.jsx';
import { Hero } from '../avatar/Hero.jsx';
import { tr, useUiPreferences } from '../../i18n/index.js';
export function DailyReward({ compact = false }: { compact?: boolean }) {
  useUiPreferences();
  const { data, busy, act, error } = useEconomy();
  if (!data) return null;
  return (
    <section className={`daily-loot ${compact ? 'daily-loot--compact' : ''}`}>
      <div className="daily-loot__gift">
        <CoinIcon size={68} />
        <Gift size={30} />
      </div>
      <div>
        <span className="eyebrow">{tr('Daily drop')}</span>
        <h3>{tr(data.dailyClaimed ? 'See you tomorrow' : 'A little boost')}</h3>
        <span className="loot-amount">
          <CoinIcon size={19} />
          30 {tr('Battle coins')}
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
      {!compact && (
        <div className="level-loot">
          <Hero size={98} loadout={{ aura: 'stardust' }} />
          <div>
            <Sparkles size={18} />
            <strong>{tr('Level 3 · Stardust')}</strong>
            <progress value={Math.min(data.level, 3)} max={3} aria-label={tr('Stardust unlock')} />
          </div>
          <button
            className="btn"
            disabled={data.level < 3 || busy || data.owned.includes('stardust')}
            onClick={() => void act('buy', 'stardust')}
          >
            {tr(data.owned.includes('stardust') ? 'Unlocked' : 'Unlock')}
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
