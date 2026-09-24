import { useEffect, useState } from 'react';
import { ArrowUpRight, Check, Gem, Sparkles, Timer } from 'lucide-react';
import { cosmetic, type OfferView } from '@battle/shared';
import { Customization } from '../components/avatar/Customization.js';
import { tr, useUiPreferences } from '../i18n/index.js';
import { useMeta } from '../hooks/useMeta.js';
import { track } from '../analytics.js';
import { CoinIcon } from '../components/currency/Coins.jsx';
import { Dialog } from '../components/Dialog.jsx';
import { OfferCard } from '../components/meta/OfferCard.jsx';
import { RewardIcon } from '../components/meta/RewardChip.jsx';
import { timeLeft } from '../components/meta/time.js';
import { MetaNotice } from '../components/meta/MetaNotice.jsx';

function DealCard({ deal, now, resetsAt }: { deal: { itemId: string; price: number; was: number; owned: boolean }; now: number; resetsAt: number }) {
  useUiPreferences();
  const { view, buyDeal, busy, error } = useMeta();
  const [confirming, setConfirming] = useState(false);
  const item = cosmetic(deal.itemId);
  if (!item) return null;
  const short = Math.max(0, deal.price - (view?.wallet.coins ?? 0));
  return (
    <article className={`deal is-${item.rarity} ${deal.owned ? 'is-owned' : ''}`}>
      <span className="deal__off">-{Math.round((1 - deal.price / deal.was) * 100)}%</span>
      <div className="deal__art">
        <RewardIcon reward={{ kind: 'item', itemId: item.id }} size={64} />
      </div>
      <span className={`rarity-tag is-${item.rarity}`}>{tr(item.rarity)}</span>
      <h3>{tr(item.name)}</h3>
      <p className="deal__price">
        <s>{deal.was}</s>
        <CoinIcon size={18} />
        <strong>{deal.price}</strong>
      </p>
      <button className="btn btn--primary deal__buy" disabled={deal.owned || Boolean(busy)} onClick={() => setConfirming(true)}>
        {deal.owned ? (
          <>
            <Check size={15} />
            {tr('Owned')}
          </>
        ) : (
          tr('Buy')
        )}
      </button>
      <Dialog open={confirming} onClose={() => setConfirming(false)} title={tr(item.name)} className="offer-confirm">
        <p className="eyebrow">{tr("Today's deal")}</p>
        <h2>{tr(item.name)}</h2>
        <div className="offer-confirm__hero">
          <RewardIcon reward={{ kind: 'item', itemId: item.id }} size={120} />
        </div>
        <div className="offer-confirm__total">
          <span>{tr('Total')}</span>
          <strong>
            <s>{deal.was}</s> {tr(`${deal.price} coins`)}
          </strong>
        </div>
        <p className="offer-confirm__note">
          <Timer size={14} />
          {tr(`This price ends in ${timeLeft(resetsAt - now)}.`)}
        </p>
        {short > 0 && <p className="offer-confirm__note is-bad">{tr(`You need ${short} more coins.`)}</p>}
        {error && confirming && <p className="error-text" role="alert">{tr(error)}</p>}
        <div className="offer-confirm__actions">
          <button className="btn btn--ghost" onClick={() => setConfirming(false)}>
            {tr('Not now')}
          </button>
          <button
            className="btn btn--primary btn--lg"
            disabled={short > 0 || Boolean(busy)}
            onClick={async () => {
              if (await buyDeal(item.id)) setConfirming(false);
            }}
          >
            {tr('Buy')}
          </button>
        </div>
      </Dialog>
    </article>
  );
}

/**
 * The shop, in the order a visitor reads it: what is special today, what the
 * currencies buy, and then the whole collection.
 *
 * Real-money prices appear only where this server can actually take a
 * payment. A price with no way to pay it is a broken promise, so an operator
 * who has not set up card payments simply sells gems in Telegram, and the web
 * shop runs on coins and gems earned in play.
 */
export function Store() {
  useUiPreferences();
  const { view, rail, error } = useMeta();
  useEffect(() => {
    track('store_opened', { from: document.referrer ? 'link' : 'nav' });
  }, []);
  const hasGems = Boolean(view && rail);
  useEffect(() => {
    if (hasGems && window.location.hash === '#gems') document.getElementById('gems')?.scrollIntoView({ block: 'start' });
  }, [hasGems]);
  const store = view?.store;
  const now = view?.serverTime ?? Date.now();
  const byKind = (kinds: OfferView['kind'][]) =>
    (store?.offers ?? []).filter((offer) => kinds.includes(offer.kind) && (offer.price.currency !== 'money' || rail !== null));
  const featured = byKind(['starter', 'pass', 'founder']).filter((offer) => !(offer.kind !== 'pass' && offer.purchased));
  const gems = byKind(['gems']);
  const extras = byKind(['bundle', 'coins']);

  return (
    <main className="page page--store">
      <header className="hero-shop-heading">
        <div>
          <span className="collection-eyebrow">{tr('THE SHOP')}</span>
          <h1>{tr('Look the part.')}</h1>
          <p>{tr('Everything here is style. Every hero plays the same fair game.')}</p>
        </div>
        <a href="/profile">
          {tr('My collection')}
          <ArrowUpRight size={17} />
        </a>
      </header>
      <MetaNotice />

      {!store ? (
        !error && <div className="shop-skeleton">
          {Array.from({ length: 3 }, (_, i) => (
            <span key={i} className="skel shop-skeleton__card" />
          ))}
        </div>
      ) : (
        <>
          {featured.length > 0 && (
            <section className="shop-shelf" aria-label={tr('Featured')}>
              <div className="collection-section-title">
                <span>
                  <Sparkles size={16} />
                  {tr('Featured')}
                </span>
              </div>
              <div className="shop-shelf__row shop-shelf__row--featured">
                {featured.map((offer) => (
                  <OfferCard key={offer.id} offer={offer} now={now} />
                ))}
              </div>
            </section>
          )}

          <section className="shop-shelf" aria-label={tr("Today's deals")}>
            <div className="collection-section-title">
              <span>
                <Timer size={16} />
                {tr("Today's deals")}
              </span>
              <small>{tr(`New deals in ${timeLeft(store.dealsResetAt - now)}`)}</small>
            </div>
            <div className="shop-shelf__row">
              {store.deals.map((deal) => (
                <DealCard key={deal.itemId} deal={deal} now={now} resetsAt={store.dealsResetAt} />
              ))}
            </div>
          </section>

          {gems.length > 0 && (
            <section className="shop-shelf" id="gems" aria-label={tr('Gems')}>
              <div className="collection-section-title">
                <span>
                  <Gem size={16} />
                  {tr('Gems')}
                </span>
                <small>{tr('Gems buy the season pass, bundles and coins. Nothing that wins a round.')}</small>
              </div>
              <div className="shop-shelf__row">
                {gems.map((offer) => (
                  <OfferCard key={offer.id} offer={offer} now={now} />
                ))}
              </div>
            </section>
          )}

          {extras.length > 0 && (
            <section className="shop-shelf" aria-label={tr('Bundles and coins')}>
              <div className="collection-section-title">
                <span>{tr('Bundles and coins')}</span>
              </div>
              <div className="shop-shelf__row">
                {extras.map((offer) => (
                  <OfferCard key={offer.id} offer={offer} now={now} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <Customization shop />
    </main>
  );
}
