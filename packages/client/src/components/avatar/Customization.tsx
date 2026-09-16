import { useEffect, useState } from 'react';
import { Check, LockKeyhole, ArrowRight, Sparkles, Play } from 'lucide-react';
import { COSMETICS, COSMETIC_SLOTS, cosmetic, type CosmeticItem } from '@battle/shared';
import { useEconomy } from '../../hooks/useEconomy.js';
import { tr, useUiPreferences } from '../../i18n/index.js';
import { Hero } from './Hero.jsx';
import { CoinCounter, CoinIcon } from '../currency/Coins.jsx';

export function Customization({ shop = false }: { shop?: boolean }) {
  useUiPreferences();
  const { data, loading, error, busy, feedback, act, refresh } = useEconomy();
  const [category, setCategory] = useState('all');
  const [selected, setSelected] = useState<string | null>(shop ? 'comet' : null);
  const [previewRun, setPreviewRun] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  const item = cosmetic(selected ?? data?.loadout.body ?? 'cloud')!;
  useEffect(() => {
    if (!previewRun) return;
    setPreviewing(true);
    const timer = setTimeout(() => setPreviewing(false), 1400);
    return () => clearTimeout(timer);
  }, [previewRun, selected]);
  if (!data)
    return (
      <section className="locker-state" aria-busy={loading}>
        {error ? (
          <>
            <p role="alert">{tr(error)}</p>
            <button className="btn" onClick={refresh}>
              {tr('Try again')}
            </button>
          </>
        ) : (
          <div className="hero-skeleton" aria-label={tr('Loading your hero')} />
        )}
      </section>
    );
  const owned = data.owned.includes(item.id);
  const equipped = data.loadout[item.slot] === item.id;
  const locked = data.level < (item.level ?? 1);
  const visible = COSMETICS.filter(
    (entry) =>
      (shop || data.owned.includes(entry.id)) &&
      (category === 'all' ||
        (category === 'featured' ? entry.rarity === 'epic' : entry.slot === category)),
  );
  const preview = { ...data.loadout, [item.slot]: item.id };
  return (
    <section className={`customization ${shop ? 'customization--shop' : ''}`}>
      <aside className="hero-preview">
        <div className="card-heading">
          <span className="eyebrow">{tr(shop ? 'Try it on' : 'Your loadout')}</span>
          <CoinCounter value={data.coins} />
        </div>
        <div
          className={`hero-plinth ${previewing && item.slot === 'finisher' ? 'hero-plinth--finish' : ''}`}
        >
          <Hero
            key={`${item.id}:${previewRun}`}
            loadout={preview}
            pose={previewing ? (item.slot === 'finisher' ? 'victory' : 'attack') : 'idle'}
            size={290}
            label={tr('Hero preview')}
          />
          <button
            className="hero-preview-play"
            onClick={() => setPreviewRun((run) => run + 1)}
            aria-label={tr('Preview animation')}
            title={tr('Preview animation')}
          >
            <Play size={17} />
          </button>
        </div>
        <span className={`rarity rarity--${item.rarity}`}>{tr(item.rarity)}</span>
        <h2>{tr(item.name)}</h2>
        <div className="loadout-slots">
          {COSMETIC_SLOTS.map((slot) => (
            <span
              key={slot}
              title={tr(cosmetic(data.loadout[slot])?.name ?? slot)}
              className={item.slot === slot ? 'is-selected' : ''}
            >
              <small>{tr(slot)}</small>
              <b>{tr(cosmetic(data.loadout[slot])?.name ?? 'None')}</b>
            </span>
          ))}
        </div>
        {locked ? (
          <span className="item-lock">
            <LockKeyhole size={16} />
            {tr('Level')} {item.level}
          </span>
        ) : (
          <button
            className="btn btn--primary btn--lg btn--block"
            disabled={busy || equipped || (!owned && data.coins < item.price)}
            onClick={() => void act(owned ? 'equip' : 'buy', item.id)}
          >
            {equipped ? (
              <>
                <Check size={17} />
                {tr('Equipped')}
              </>
            ) : owned ? (
              tr('Equip')
            ) : item.price === 0 ? (
              tr('Unlock')
            ) : (
              <>
                <CoinIcon size={21} />
                {item.price} · {tr('Buy')}
              </>
            )}
          </button>
        )}
        {equipped && ['accessory', 'aura', 'finisher'].includes(item.slot) && (
          <button className="btn" disabled={busy} onClick={() => void act('unequip', item.slot)}>
            {tr('Remove')}
          </button>
        )}
        {!owned && !locked && data.coins < item.price && (
          <p className="dim">{tr('Earn coins in ranked battles.')}</p>
        )}
        {error && (
          <p className="error-text" role="alert">
            {tr(error)}
          </p>
        )}
      </aside>
      <div className="locker-catalog">
        <div className="locker-tabs" role="group" aria-label={tr('Item category')}>
          {['all', ...(shop ? ['featured'] : []), ...COSMETIC_SLOTS].map((slot) => (
            <button
              className={category === slot ? 'is-selected' : ''}
              key={slot}
              onClick={() => setCategory(slot)}
              aria-pressed={category === slot}
            >
              {tr(slot)}
            </button>
          ))}
        </div>
        <div className="cosmetic-grid">
          {visible.map((entry) => (
            <ItemCard
              key={entry.id}
              item={entry}
              selected={item.id === entry.id}
              owned={data.owned.includes(entry.id)}
              equipped={data.loadout[entry.slot] === entry.id}
              isNew={feedback?.kind === 'buy' && feedback.itemId === entry.id}
              onSelect={() => setSelected(entry.id)}
            />
          ))}
        </div>
        {!visible.length && (
          <div className="locker-empty">
            <Sparkles size={28} />
            <p>{tr('Your next find is in the store.')}</p>
            <a className="text-link" href="/store">
              {tr('Open store')}
              <ArrowRight size={16} />
            </a>
          </div>
        )}
      </div>
    </section>
  );
}

function ItemCard({
  item,
  selected,
  owned,
  equipped,
  isNew,
  onSelect,
}: {
  item: CosmeticItem;
  selected: boolean;
  owned: boolean;
  equipped: boolean;
  isNew: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={`cosmetic-card cosmetic-card--${item.rarity} ${selected ? 'is-selected' : ''}`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="cosmetic-card__status">
        {isNew ? (
          tr('New')
        ) : equipped ? (
          <Check size={14} />
        ) : owned ? (
          tr('Owned')
        ) : item.level ? (
          `${tr('Level')} ${item.level}`
        ) : (
          tr(item.rarity)
        )}
      </span>
      <Hero size={156} loadout={{ [item.slot]: item.id }} />
      <strong>{tr(item.name)}</strong>
      <span className="cosmetic-price">
        {owned ? (
          tr(equipped ? 'Equipped' : 'Owned')
        ) : item.price ? (
          <>
            <CoinIcon size={19} />
            {item.price}
          </>
        ) : (
          tr('Unlock')
        )}
      </span>
    </button>
  );
}
