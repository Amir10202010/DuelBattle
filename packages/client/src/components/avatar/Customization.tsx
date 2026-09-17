import { useEffect, useState } from 'react';
import { ArrowRight, Check, LockKeyhole, Play, Sparkles, X } from 'lucide-react';
import { COSMETICS, COSMETIC_SLOTS, cosmetic, type CosmeticItem } from '@battle/shared';
import { useEconomy } from '../../hooks/useEconomy.js';
import { tr, useUiPreferences } from '../../i18n/index.js';
import { Hero } from './Hero.jsx';
import { CoinIcon } from '../currency/Coins.jsx';

/** Slot names as a player would say them, not as the data model spells them. */
const SLOT_LABELS: Record<string, string> = {
  all: 'Everything',
  featured: 'Featured',
  body: 'Character',
  outfit: 'Outfit',
  hair: 'Hair',
  accessory: 'Face',
  weapon: 'Gear',
  aura: 'Aura',
  finisher: 'Finisher',
};

const slotLabel = (slot: string) => tr(SLOT_LABELS[slot] ?? slot);

/**
 * The locker.
 *
 * Every cosmetic is drawn with the same hero rig, so a card is a real preview
 * rather than an icon, and the big preview shows the item on the loadout you
 * already own — you see what you would actually look like, not what the item
 * looks like alone.
 *
 * The equipped strip doubles as navigation: tapping a slot filters the catalogue
 * to it and selects what is in it. That is the question a player has when they
 * look at the strip ("what else goes there?"), answered in one tap.
 */
export function Customization({ shop = false }: { shop?: boolean }) {
  useUiPreferences();
  const { data, loading, error, busy, feedback, act, refresh } = useEconomy();
  const [category, setCategory] = useState('all');
  const [selected, setSelected] = useState<string | null>(shop ? 'comet' : null);
  const [previewRun, setPreviewRun] = useState(0);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    if (!previewRun) return;
    setPreviewing(true);
    const timer = setTimeout(() => setPreviewing(false), 1400);
    return () => clearTimeout(timer);
  }, [previewRun, selected]);

  if (!data)
    return (
      <section className="locker-state panel" aria-busy={loading}>
        {error ? (
          <div className="blank">
            <X size={26} />
            <h3>{tr('Your locker did not load.')}</h3>
            <p>{tr(error)}</p>
            <button className="btn" onClick={refresh}>
              {tr('Try again')}
            </button>
          </div>
        ) : (
          <div className="locker-skeleton" aria-label={tr('Loading your hero')}>
            <span className="skel" />
            <div>
              <span className="skel" />
              <span className="skel" />
              <span className="skel" />
              <span className="skel" />
            </div>
          </div>
        )}
      </section>
    );

  const item = cosmetic(selected ?? data.loadout.body ?? 'cloud')!;
  const owned = data.owned.includes(item.id);
  const equipped = data.loadout[item.slot] === item.id;
  const locked = data.level < (item.level ?? 1);
  const affordable = data.coins >= item.price;
  const removable = equipped && ['accessory', 'aura', 'finisher'].includes(item.slot);
  const visible = COSMETICS.filter(
    (entry) =>
      (shop || data.owned.includes(entry.id)) &&
      (category === 'all'
        ? true
        : category === 'featured'
          ? entry.rarity === 'epic'
          : entry.slot === category),
  );
  const preview = { ...data.loadout, [item.slot]: item.id };

  const pickSlot = (slot: string) => {
    setCategory(slot);
    const worn = data.loadout[slot as (typeof COSMETIC_SLOTS)[number]];
    setSelected(worn ?? COSMETICS.find((entry) => entry.slot === slot)?.id ?? null);
  };

  return (
    <section className={`locker ${shop ? 'locker--shop' : ''}`}>
      <aside className="locker__preview plate">
        <div
          className={`hero-plinth ${previewing && item.slot === 'finisher' ? 'hero-plinth--finish' : ''}`}
        >
          <Hero
            key={`${item.id}:${previewRun}`}
            loadout={preview}
            pose={previewing ? (item.slot === 'finisher' ? 'victory' : 'attack') : 'idle'}
            size={300}
            label={tr('Hero preview')}
          />
          <button
            className="icon-button locker__replay"
            onClick={() => setPreviewRun((run) => run + 1)}
            aria-label={tr('Preview animation')}
            title={tr('Preview animation')}
          >
            <Play size={16} />
          </button>
        </div>

        <div className="locker__item">
          <span className={`rarity is-${item.rarity}`}>{tr(item.rarity)}</span>
          <h2>{tr(item.name)}</h2>
          <span className="dim">{slotLabel(item.slot)}</span>
        </div>

        {locked ? (
          <p className="locker__locked">
            <LockKeyhole size={15} />
            {tr('Unlocks at level ')}
            {item.level}
          </p>
        ) : (
          <button
            className="btn btn--primary btn--lg btn--block"
            disabled={busy || equipped || (!owned && !affordable)}
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
                <CoinIcon size={19} />
                {item.price}
                <span className="locker__buy-word">{tr('Buy')}</span>
              </>
            )}
          </button>
        )}

        {removable && (
          <button
            className="btn btn--ghost btn--block"
            disabled={busy}
            onClick={() => void act('unequip', item.slot)}
          >
            {tr('Take it off')}
          </button>
        )}

        <div className="locker__slots" role="group" aria-label={tr('Equipped items')}>
          {COSMETIC_SLOTS.map((slot) => {
            const worn = cosmetic(data.loadout[slot]);
            return (
              <button
                key={slot}
                className={item.slot === slot ? 'is-selected' : ''}
                aria-pressed={item.slot === slot}
                onClick={() => pickSlot(slot)}
              >
                <small>{slotLabel(slot)}</small>
                <b>{worn ? tr(worn.name) : tr('Empty')}</b>
              </button>
            );
          })}
        </div>

        {error && (
          <p className="error-text" role="alert">
            {tr(error)}
          </p>
        )}
      </aside>

      <div className="locker__catalog">
        <div className="tabs" role="group" aria-label={tr('Item category')}>
          {['all', ...(shop ? ['featured'] : []), ...COSMETIC_SLOTS].map((slot) => (
            <button
              className={category === slot ? 'is-active' : ''}
              key={slot}
              onClick={() => setCategory(slot)}
              aria-pressed={category === slot}
            >
              {slotLabel(slot)}
            </button>
          ))}
        </div>

        {visible.length ? (
          <div className="locker__grid">
            {visible.map((entry) => (
              <ItemCard
                key={entry.id}
                item={entry}
                selected={item.id === entry.id}
                owned={data.owned.includes(entry.id)}
                equipped={data.loadout[entry.slot] === entry.id}
                locked={data.level < (entry.level ?? 1)}
                affordable={data.coins >= entry.price}
                isNew={feedback?.kind === 'buy' && feedback.itemId === entry.id}
                onSelect={() => setSelected(entry.id)}
              />
            ))}
          </div>
        ) : (
          <div className="blank">
            <Sparkles size={26} />
            <h3>{tr(shop ? 'Nothing here yet.' : 'Nothing in this slot yet.')}</h3>
            <p>
              {tr(
                shop
                  ? 'Try another category — every look in the game is in one of them.'
                  : 'Everything you own shows up here. The store has the rest.'
              )}
            </p>
            {!shop && (
              <a className="text-link" href="/store">
                {tr('Open the store')}
                <ArrowRight size={16} />
              </a>
            )}
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
  locked,
  affordable,
  isNew,
  onSelect,
}: {
  item: CosmeticItem;
  selected: boolean;
  owned: boolean;
  equipped: boolean;
  locked: boolean;
  affordable: boolean;
  isNew: boolean;
  onSelect: () => void;
}) {
  useUiPreferences();
  return (
    <button
      className={`item plate is-${item.rarity} ${selected ? 'is-selected' : ''} ${
        locked ? 'is-locked' : ''
      } ${equipped ? 'is-equipped' : ''} ${isNew ? 'is-new' : ''}`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="item__tag">
        {isNew ? (
          tr('New')
        ) : equipped ? (
          <>
            <Check size={12} />
            {tr('On')}
          </>
        ) : locked ? (
          <>
            <LockKeyhole size={11} />
            {item.level}
          </>
        ) : (
          <span className={`rarity is-${item.rarity}`}>{tr(item.rarity)}</span>
        )}
      </span>
      <span className="item__art" data-slot={item.slot}>
        <Hero size={150} loadout={{ [item.slot]: item.id }} />
      </span>
      <strong>{tr(item.name)}</strong>
      <span className={`item__price ${!owned && !affordable ? 'is-short' : ''}`}>
        {owned ? (
          tr(equipped ? 'Equipped' : 'Owned')
        ) : item.price ? (
          <>
            <CoinIcon size={17} />
            {item.price}
          </>
        ) : (
          tr('Unlock')
        )}
      </span>
    </button>
  );
}
