import { useEffect, useRef, type CSSProperties } from 'react';
import { Check, Crown, LockKeyhole, Timer } from 'lucide-react';
import { PASS_POINTS, type SeasonTierView } from '@battle/shared';
import { tr, useUiPreferences } from '../i18n/index.js';
import { useMeta } from '../hooks/useMeta.js';
import { track } from '../analytics.js';
import { OfferCard } from '../components/meta/OfferCard.jsx';
import { RewardChip } from '../components/meta/RewardChip.jsx';
import { timeLeft } from '../components/meta/time.js';
import { MetaNotice } from '../components/meta/MetaNotice.jsx';

function TierColumn({ tier, current, premium }: { tier: SeasonTierView; current: boolean; premium: boolean }) {
  const { claimTier, busy } = useMeta();
  const freeReady = tier.reached && !tier.freeClaimed;
  const premiumReady = tier.reached && premium && !tier.premiumClaimed;
  return (
    <li className={`tier ${tier.reached ? 'is-reached' : ''} ${current ? 'is-current' : ''}`} data-tier={tier.tier}>
      <span className="tier__number num">{tier.tier}</span>
      <div className={`tier__cell tier__cell--free ${freeReady ? 'is-ready' : ''} ${tier.freeClaimed ? 'is-claimed' : ''}`}>
        {tier.free.map((reward, index) => (
          <RewardChip key={index} reward={reward} compact />
        ))}
        {tier.freeClaimed ? (
          <Check className="tier__check" size={16} aria-label={tr('Collected')} />
        ) : freeReady ? (
          <button className="btn btn--sm btn--primary tier__claim" disabled={Boolean(busy)} onClick={() => void claimTier(tier.tier, 'free')}>
            {tr('Collect')}
          </button>
        ) : null}
      </div>
      <div className={`tier__cell tier__cell--premium ${premium ? '' : 'is-locked'} ${premiumReady ? 'is-ready' : ''} ${tier.premiumClaimed ? 'is-claimed' : ''}`}>
        {tier.premium.map((reward, index) => (
          <RewardChip key={index} reward={reward} compact />
        ))}
        {!premium ? (
          <LockKeyhole className="tier__lock" size={14} aria-label={tr('Premium track')} />
        ) : tier.premiumClaimed ? (
          <Check className="tier__check" size={16} aria-label={tr('Collected')} />
        ) : premiumReady ? (
          <button className="btn btn--sm btn--primary tier__claim" disabled={Boolean(busy)} onClick={() => void claimTier(tier.tier, 'premium')}>
            {tr('Collect')}
          </button>
        ) : null}
      </div>
    </li>
  );
}

/**
 * The season, laid out as a road.
 *
 * Two lanes, thirty stops. The free lane is everybody's; the premium lane is
 * visible to everybody too, locked, because a reward you can see is the only
 * honest way to sell one. Buying the pass opens every tier already reached,
 * so there is never a reason to wait before deciding.
 */
export function Pass() {
  useUiPreferences();
  const { view, claimAll, busy, error } = useMeta();
  const road = useRef<HTMLOListElement>(null);
  useEffect(() => {
    track('pass_opened', { from: document.referrer ? 'link' : 'nav' });
  }, []);
  // Scroll the road so the current tier is in view on arrival, once per season.
  const seasonId = view?.season.id;
  useEffect(() => {
    if (!seasonId) return;
    road.current?.querySelector('.tier.is-current')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [seasonId]);

  if (!view)
    return (
      <main className="page pass-page">
        <h1>{tr('Season pass')}</h1>
        <MetaNotice />
        {!error && <span className="skel pass-page__skel" aria-label={tr('Loading…')} />}
      </main>
    );
  const { season, store } = view;
  const waiting = season.tiers.filter((t) => t.reached && (!t.freeClaimed || (season.premium && !t.premiumClaimed))).length;
  const passOffers = store.offers.filter((offer) => offer.kind === 'pass');

  return (
    <main className="page pass-page" style={{ '--season-accent': season.accent } as CSSProperties}>
      <MetaNotice />
      <header className="pass-hero plate">
        <div className="pass-hero__title">
          <span className="eyebrow">{tr(`Season ${season.number}`)}</span>
          <h1 className="display">{tr(season.name)}</h1>
          <p>{tr(season.tagline)}</p>
          <span className="pass-hero__time">
            <Timer size={14} />
            {tr(`Ends in ${timeLeft(season.endsAt - view.serverTime)}`)}
          </span>
        </div>
        <div className="pass-hero__progress">
          <span className="pass-hero__tier">
            <small>{tr('Tier')}</small>
            <b className="num">{season.tier}</b>
            <small>/ {season.tiers.length}</small>
          </span>
          <div className="season-card__bar" role="progressbar" aria-label={tr('Progress to the next tier')} aria-valuenow={season.into} aria-valuemin={0} aria-valuemax={season.cost}>
            <i style={{ width: `${season.maxed ? 100 : (season.into / season.cost) * 100}%` }} />
          </div>
          <small className="num">{season.maxed ? tr('Track complete') : `${season.into} / ${season.cost} ${tr('XP')}`}</small>
          {waiting > 0 && (
            <button className="btn btn--primary btn--lg pass-hero__claim" disabled={Boolean(busy)} onClick={() => void claimAll()}>
              {tr(`Collect ${waiting}`)}
            </button>
          )}
        </div>
        <div className="pass-hero__premium">
          {season.premium ? (
            <p className="pass-hero__owned">
              <Crown size={18} />
              {tr(season.premiumViaMembership ? 'Premium track included with your membership' : 'Premium track unlocked')}
            </p>
          ) : (
            <div className="pass-hero__offers">
              {passOffers.map((offer) => (
                <OfferCard key={offer.id} offer={offer} now={view.serverTime} />
              ))}
            </div>
          )}
        </div>
      </header>

      <section className="pass-road" aria-label={tr('Season track')}>
        <div className="pass-road__lanes" aria-hidden="true">
          <span>{tr('Free')}</span>
          <span>
            <Crown size={13} />
            {tr('Premium track')}
          </span>
        </div>
        <ol className="pass-road__tiers" ref={road}>
          {season.tiers.map((tier) => (
            <TierColumn key={tier.tier} tier={tier} current={tier.tier === Math.min(season.tiers.length, season.tier + 1)} premium={season.premium} />
          ))}
        </ol>
      </section>

      <section className="pass-earn plate" aria-label={tr('How to earn pass XP')}>
        <h2>{tr('How to earn pass XP')}</h2>
        <ul>
          <li><b>+{PASS_POINTS.finish}</b>{tr('Finish any match')}</li>
          <li><b>+{PASS_POINTS.win}</b>{tr('Win it')}</li>
          <li><b>+{PASS_POINTS.round}</b>{tr('Every round you take')}</li>
          <li><b>+{PASS_POINTS.ranked}</b>{tr('Ranked matches')}</li>
          <li><b>+{PASS_POINTS.firstWinOfDay}</b>{tr('First win of the day')}</li>
          <li><b>80–600</b>{tr('Daily and weekly quests')}</li>
        </ul>
      </section>
    </main>
  );
}
