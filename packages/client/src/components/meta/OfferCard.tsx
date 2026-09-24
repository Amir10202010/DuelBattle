import { useState, type CSSProperties } from 'react';
import { Check, CreditCard, LockKeyhole, ShieldCheck, Timer } from 'lucide-react';
import { CHESTS, chestOdds, formatUsd, type OfferView } from '@battle/shared';
import { tr, useUiPreferences } from '../../i18n/index.js';
import { useMeta } from '../../hooks/useMeta.js';
import { track } from '../../analytics.js';
import { CoinIcon } from '../currency/Coins.jsx';
import { Dialog } from '../Dialog.jsx';
import { GemIcon } from './Currency.jsx';
import { RewardChip } from './RewardChip.jsx';
import { timeLeft } from './time.js';

/** A price as the player will actually be charged it, on this client's rail. */
export function priceLabel(offer: Pick<OfferView, 'price'>, rail: 'card' | 'stars' | null): string {
  const price = offer.price;
  if (price.currency === 'money') return rail === 'stars' ? `${price.stars} ${tr('Stars')}` : formatUsd(price.usdCents);
  return `${price.amount.toLocaleString()} ${tr(price.currency === 'gems' ? 'gems' : 'coins')}`;
}

const BADGES: Record<NonNullable<OfferView['badge']>, string> = {
  popular: 'Most popular',
  'best-value': 'Best value',
  'one-time': 'One time only',
  new: 'New',
};

/**
 * One thing for sale, and the step before paying for it.
 *
 * Nothing is bought from the card itself: the button opens a confirmation
 * that lists exactly what arrives and exactly what it costs, in the currency
 * it will be charged in. A real-money offer says where the payment happens
 * before it sends anybody there.
 */
export function OfferCard({ offer, now, onPurchased }: {
  offer: OfferView;
  now: number;
  onPurchased?: () => void;
}) {
  useUiPreferences();
  const { view, buy, checkout, busy, error, rail } = useMeta();
  const [confirming, setConfirming] = useState(false);
  const money = offer.price.currency === 'money';
  const wallet = view?.wallet;
  const price = offer.price;
  const short =
    price.currency !== 'money' && wallet ? Math.max(0, price.amount - (price.currency === 'gems' ? wallet.gems : wallet.coins)) : 0;
  const pending = Boolean(busy && busy.includes(offer.id));
  const pass = offer.kind === 'pass';

  const confirm = async () => {
    if (money) {
      if (await checkout(offer.id)) {
        setConfirming(false);
        onPurchased?.();
      }
      return;
    }
    if (await buy(offer.id)) {
      setConfirming(false);
      onPurchased?.();
    }
  };

  return (
    <article className={`offer offer--${offer.kind} ${offer.purchased ? 'is-owned' : ''}`} style={{ '--offer-accent': offer.accent } as CSSProperties}>
      {offer.badge && <span className={`offer__badge offer__badge--${offer.badge}`}>{tr(BADGES[offer.badge])}</span>}
      <div className="offer__art" aria-hidden="true">
        {offer.kind === 'gems' ? (
          <span className="offer__gems">
            {Array.from({ length: Math.min(5, Math.ceil(Math.log2(offer.rewards[0]?.kind === 'gems' ? offer.rewards[0].amount / 40 : 2))) }, (_, i) => (
              <GemIcon key={i} size={44 - i * 4} />
            ))}
          </span>
        ) : offer.kind === 'coins' ? (
          <span className="offer__gems">
            {Array.from({ length: offer.id === 'coins_6500' ? 5 : 3 }, (_, i) => (
              <CoinIcon key={i} size={40 - i * 3} />
            ))}
          </span>
        ) : (
          <span className="offer__contents">
            {offer.rewards.slice(0, 4).map((reward, index) => (
              <RewardChip key={index} reward={reward} compact />
            ))}
          </span>
        )}
      </div>
      <h3 className="offer__name">{tr(offer.name)}</h3>
      <p className="offer__desc">{tr(offer.description)}</p>
      {offer.endsAt && !offer.purchased && (
        <span className="offer__timer">
          <Timer size={12} />
          {tr(`Ends in ${timeLeft(offer.endsAt - now)}`)}
        </span>
      )}
      <button
        className={`btn offer__buy ${offer.purchased ? '' : 'btn--primary'}`}
        disabled={offer.purchased || Boolean(busy) || (money && !rail)}
        onClick={() => {
          track('offer_viewed', { offer: offer.id, from: 'store' });
          setConfirming(true);
        }}
      >
        {offer.purchased ? (
          <>
            <Check size={16} />
            {tr(pass ? 'Active' : 'Owned')}
          </>
        ) : (
          <>
            {offer.price.currency === 'gems' ? <GemIcon size={18} /> : offer.price.currency === 'coins' ? <CoinIcon size={18} /> : null}
            {priceLabel(offer, rail)}
          </>
        )}
      </button>

      <Dialog open={confirming} onClose={() => setConfirming(false)} title={tr(offer.name)} className="offer-confirm">
        <p className="eyebrow">{tr(money ? 'Checkout' : 'Confirm purchase')}</p>
        <h2>{tr(offer.name)}</h2>
        <p className="dim">{tr(offer.description)}</p>
        {offer.rewards.length > 0 && (
          <>
            <p className="offer-confirm__label">{tr('You get')}</p>
            <ul className="offer-confirm__list">
              {offer.rewards.map((reward, index) => (
                <li key={index}>
                  <RewardChip reward={reward} />
                </li>
              ))}
            </ul>
          </>
        )}
        {offer.rewards.some((reward) => reward.kind === 'chest') && (
          <div className="offer-confirm__odds">
            <p className="offer-confirm__note">{tr('Chests open on delivery. Their contents are random; the chances are shown below.')}</p>
            {offer.rewards.filter((reward) => reward.kind === 'chest').map((reward, index) => (
              <div key={index}>
                <strong>{tr(CHESTS[reward.chestId].name)}</strong>
                <ul>{chestOdds(reward.chestId).map((line) => (
                  <li key={line.label}>{tr(line.label)}: {Math.round(line.chance * 100)}%</li>
                ))}</ul>
              </div>
            ))}
            <p className="offer-confirm__note">{tr('If you own every possible cosmetic, the item roll pays 150 coins instead.')}</p>
          </div>
        )}
        <div className="offer-confirm__total">
          <span>{tr('Total')}</span>
          <strong>{priceLabel(offer, rail)}</strong>
        </div>
        {money ? (
          <p className="offer-confirm__note">
            <ShieldCheck size={14} />
            {tr(rail === 'stars'
              ? 'You will pay in Telegram Stars. Telegram handles the payment.'
              : 'You will pay on a secure Stripe page. Card details never reach DuelBattle.')}
          </p>
        ) : short > 0 ? (
          <p className="offer-confirm__note is-bad">
            <LockKeyhole size={14} />
            {tr(`You need ${short} more ${offer.price.currency === 'gems' ? 'gems' : 'coins'}.`)}
          </p>
        ) : null}
        {error && confirming && <p className="error-text" role="alert">{tr(error)}</p>}
        <div className="offer-confirm__actions">
          <button className="btn btn--ghost" onClick={() => setConfirming(false)}>
            {tr('Not now')}
          </button>
          <button className="btn btn--primary btn--lg" disabled={Boolean(busy) || short > 0 || (money && !rail)} onClick={() => void confirm()}>
            {money ? <CreditCard size={17} /> : null}
            {pending ? tr('Working…') : tr(money ? 'Continue to payment' : 'Buy')}
          </button>
        </div>
      </Dialog>
    </article>
  );
}
