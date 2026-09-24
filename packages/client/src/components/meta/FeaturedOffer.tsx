import type { CSSProperties } from 'react';
import { ArrowRight, Crown, Sparkles, Timer } from 'lucide-react';
import { cosmetic, type OfferView } from '@battle/shared';
import { tr, useUiPreferences } from '../../i18n/index.js';
import { useMeta } from '../../hooks/useMeta.js';
import { track } from '../../analytics.js';
import { RewardIcon } from './RewardChip.jsx';
import { priceLabel } from './OfferCard.jsx';
import { timeLeft } from './time.js';

/**
 * One thing from the shop, chosen for this player today.
 *
 * In order: the starter pack while a new player can still get it, the season's
 * premium track for anybody without it, then one of today's deals. Only ever
 * one, only ever something they do not already have, and never something this
 * server cannot actually sell.
 */
export function FeaturedOffer({ onNavigate }: { onNavigate: (path: string) => void }) {
  useUiPreferences();
  const { view, rail } = useMeta();
  if (!view) return null;
  const { store, season } = view;
  const sellable = (offer: OfferView) =>
    !offer.purchased && (offer.price.currency !== 'money' || rail !== null);
  const starter = store.offers.find((offer) => offer.id === 'starter_pack' && sellable(offer));
  const open = (from: string) => {
    track('offer_viewed', { offer: from, from: 'home' });
    onNavigate(from === 'pass' ? '/pass' : '/store');
  };

  if (starter)
    return (
      <button className="featured-offer plate" style={{ '--offer-accent': starter.accent } as CSSProperties} onClick={() => open(starter.id)}>
        <span className="featured-offer__badge">{tr('One time only')}</span>
        <span className="featured-offer__art">
          {starter.rewards.slice(0, 4).map((reward, index) => (
            <span key={index} style={{ '--i': index } as CSSProperties}>
              <RewardIcon reward={reward} size={30} />
            </span>
          ))}
        </span>
        <span className="featured-offer__copy">
          <strong>{tr(starter.name)}</strong>
          <small>{tr(starter.description)}</small>
          {starter.endsAt && (
            <small className="featured-offer__timer">
              <Timer size={12} />
              {tr(`Ends in ${timeLeft(starter.endsAt - view.serverTime)}`)}
            </small>
          )}
        </span>
        <span className="featured-offer__price">
          {priceLabel(starter, rail)}
          <ArrowRight size={16} />
        </span>
      </button>
    );

  if (!season.premium)
    return (
      <button className="featured-offer featured-offer--pass plate" style={{ '--offer-accent': season.accent } as CSSProperties} onClick={() => open('pass')}>
        <span className="featured-offer__badge">
          <Crown size={12} />
          {tr(season.name)}
        </span>
        <span className="featured-offer__art">
          {season.tiers.filter((t) => t.premium.some((r) => r.kind === 'item')).slice(0, 4).map((tier) => (
            <span key={tier.tier}>
              <RewardIcon reward={tier.premium.find((r) => r.kind === 'item')!} size={30} />
            </span>
          ))}
        </span>
        <span className="featured-offer__copy">
          <strong>{tr('Unlock the premium track')}</strong>
          <small>{tr('Every original look this season, and most of the price back in gems.')}</small>
        </span>
        <span className="featured-offer__price">
          {season.passPrice}
          {` ${tr('gems')}`}
          <ArrowRight size={16} />
        </span>
      </button>
    );

  const deal = store.deals.find((entry) => !entry.owned);
  if (!deal) return null;
  const item = cosmetic(deal.itemId);
  return (
    <button className="featured-offer plate" onClick={() => open(`deal:${deal.itemId}`)}>
      <span className="featured-offer__badge">
        <Sparkles size={12} />
        {tr("Today's deal")}
      </span>
      <span className="featured-offer__art">
        <span>
          <RewardIcon reward={{ kind: 'item', itemId: deal.itemId }} size={40} />
        </span>
      </span>
      <span className="featured-offer__copy">
        <strong>{tr(item?.name ?? deal.itemId)}</strong>
        <small>
          <s>{deal.was}</s> {tr(`${deal.price} coins today`)}
        </small>
      </span>
      <span className="featured-offer__price">
        {tr('See deals')}
        <ArrowRight size={16} />
      </span>
    </button>
  );
}
