import type { CSSProperties } from 'react';
import { ArrowRight, Crown, LockKeyhole, Timer } from 'lucide-react';
import { tr, useUiPreferences } from '../../i18n/index.js';
import { useMeta } from '../../hooks/useMeta.js';
import { RewardIcon, rewardLabel } from './RewardChip.jsx';
import { timeLeft } from './time.js';

/**
 * The season in one card: where you are, what the next tier holds, and the
 * one button that matters — collect, when something is waiting, otherwise a
 * way into the full track.
 */
export function SeasonCard({ onNavigate }: { onNavigate: (path: string) => void }) {
  useUiPreferences();
  const { view, claimAll, busy } = useMeta();
  if (!view) return <section className="season-card plate" aria-busy="true"><span className="skel season-card__skel" /></section>;
  const { season } = view;
  const waiting = season.tiers.filter((t) => t.reached && (!t.freeClaimed || (season.premium && !t.premiumClaimed))).length;
  const next = season.tiers[Math.min(season.tiers.length - 1, season.tier)];
  return (
    <section className={`season-card plate ${season.premium ? 'is-premium' : ''}`} style={{ '--season-accent': season.accent } as CSSProperties} aria-label={tr('Season pass')}>
      <header className="season-card__head">
        <div>
          <span className="eyebrow">{tr(`Season ${season.number}`)}</span>
          <h2>{tr(season.name)}</h2>
        </div>
        <span className="season-card__time">
          <Timer size={13} />
          {timeLeft(season.endsAt - view.serverTime)}
        </span>
      </header>
      <div className="season-card__progress">
        <span className="season-card__tier" aria-label={tr(`Tier ${season.tier}`)}>
          <small>{tr('Tier')}</small>
          <b className="num">{season.tier}</b>
        </span>
        <div className="season-card__bar-wrap">
          <div
            className="season-card__bar"
            role="progressbar"
            aria-label={tr('Progress to the next tier')}
            aria-valuenow={season.into}
            aria-valuemin={0}
            aria-valuemax={season.cost}
          >
            <i style={{ width: `${season.maxed ? 100 : (season.into / season.cost) * 100}%` }} />
          </div>
          <small className="num">{season.maxed ? tr('Track complete') : `${season.into} / ${season.cost} ${tr('XP')}`}</small>
        </div>
      </div>
      {next && !season.maxed && (
        <div className="season-card__next">
          <span className="season-card__label">{tr(`Tier ${next.tier}`)}</span>
          <span className="season-card__reward" title={next.free.map(rewardLabel).join(', ')}>
            <RewardIcon reward={next.free[0]!} size={26} />
          </span>
          <span className={`season-card__reward is-premium ${season.premium ? '' : 'is-locked'}`} title={next.premium.map(rewardLabel).join(', ')}>
            <RewardIcon reward={next.premium[0]!} size={26} />
            {!season.premium && <LockKeyhole size={11} className="season-card__lock" />}
          </span>
        </div>
      )}
      <div className="season-card__actions">
        {waiting > 0 ? (
          <button className="btn btn--primary season-card__claim" disabled={Boolean(busy)} onClick={() => void claimAll()}>
            {tr(`Collect ${waiting}`)}
          </button>
        ) : (
          <button className="btn season-card__open" onClick={() => onNavigate('/pass')}>
            {tr('Open the pass')}
            <ArrowRight size={15} />
          </button>
        )}
        {!season.premium && (
          <button className="season-card__premium" onClick={() => onNavigate('/pass')}>
            <Crown size={14} />
            {tr('Premium track')}
          </button>
        )}
      </div>
    </section>
  );
}
