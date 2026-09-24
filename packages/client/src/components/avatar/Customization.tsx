import { useEffect, useState } from 'react';
import { ArrowRight, Check, ChevronRight, Gem, LockKeyhole, Search, Sparkles, X } from 'lucide-react';
import { HEROES, cosmetic, cosmeticState, heroById, previewItem, type EconomyView } from '@battle/shared';
import { useEconomy } from '../../hooks/useEconomy.js';
import { tr, useUiPreferences } from '../../i18n/index.js';
import { HeroCard } from './HeroCard.js';
import { HeroScene } from './HeroScene.js';
import { GearArt } from './GearArt.js';
import { EXCLUSIVE_SOURCE, HeroPreview, cosmeticsForHero } from './HeroPreview.js';
import { BannerSwatch } from '../meta/RewardChip.js';
import { CoinIcon } from '../currency/Coins.js';
import { Dialog } from '../Dialog.js';

function useCompactPreview() {
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 899px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 899px)');
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return compact;
}

export function Customization({ shop = false }: { shop?: boolean }) {
  useUiPreferences();
  const { data, loading, error, refresh } = useEconomy();
  if (!data) return <section className="collection-state" aria-busy={loading} aria-label={tr('Loading your hero')}>
    {error ? <div className="collection-empty"><X size={28} /><h2>{tr('Your locker did not load.')}</h2><p>{tr(error)}</p><button className="collection-button" onClick={refresh}>{tr('Try again')}</button></div>
      : <><span className="collection-skeleton skel" /><div className="collection-grid">{Array.from({ length: 6 }, (_, i) => <span key={i} className="collection-skeleton skel" />)}</div></>}
  </section>;
  return <Collection shop={shop} data={data} />;
}

function Collection({ shop, data }: { shop: boolean; data: EconomyView }) {
  const { feedback } = useEconomy();
  const [selected, setSelected] = useState(shop ? 'spider-man' : data.loadout.skin ?? data.loadout.body ?? 'cloud');
  const [category, setCategory] = useState('heroes');
  const [filter, setFilter] = useState(shop ? 'all' : 'owned');
  const [query, setQuery] = useState('');
  const [rarity, setRarity] = useState('all');
  const [sort, setSort] = useState('collection');
  const [styleHero, setStyleHero] = useState(shop ? 'all' : data.loadout.body ?? 'cloud');
  const [limit, setLimit] = useState(24);
  const [detailOpen, setDetailOpen] = useState(false);
  const compact = useCompactPreview();
  const item = cosmetic(selected) ?? cosmetic('cloud')!;
  const preview = previewItem(data.loadout, item);
  const hero = heroById(preview.body);
  const ownedCount = HEROES.filter((entry) => data.owned.includes(entry.id)).length;
  const select = (id: string) => { setSelected(id); if (compact) setDetailOpen(true); };
  const chooseCategory = (value: string) => { setCategory(value); setQuery(''); setLimit(24); };
  const needle = query.trim().toLocaleLowerCase();
  const ranks: Record<string, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };
  const matchesItem = (entry: { id: string; name: string; rarity: string; price: number }) => {
    const definition = heroById(cosmetic(entry.id)?.heroId ?? entry.id);
    const matches = [entry.name, tr(entry.name), ...(category === 'gear' ? [] : [definition.name, tr(definition.name), definition.title, ...definition.tags])].some((part) => part.toLocaleLowerCase().includes(needle));
    return matches && (rarity === 'all' || entry.rarity === rarity) && (filter === 'all' || (filter === 'owned' && data.owned.includes(entry.id)) || (filter === 'missing' && !data.owned.includes(entry.id)) || (filter === 'affordable' && !data.owned.includes(entry.id) && cosmeticState(cosmetic(entry.id)!, data).affordable && !cosmeticState(cosmetic(entry.id)!, data).requiresHero) || (filter === 'new' && definition.shop.isNew));
  };
  const compare = (a: { name: string; price: number; rarity: string }, b: { name: string; price: number; rarity: string }) => sort === 'price-up' ? a.price - b.price : sort === 'price-down' ? b.price - a.price : sort === 'rarity' ? ranks[b.rarity]! - ranks[a.rarity]! : sort === 'name' ? tr(a.name).localeCompare(tr(b.name)) : 0;
  const visible = HEROES.filter(matchesItem).sort(compare);
  const categories = [['heroes', 'Heroes'], ['styles', 'Forms'], ['gear', 'Gear'], ['looks', 'Looks'], ['identity', 'Titles & banners']];
  const visibleCosmetics = cosmeticsForHero(styleHero, category).filter(matchesItem).sort(compare);
  const resetFilters = () => { setQuery(''); setFilter('all'); setRarity('all'); setStyleHero('all'); };
  const setCollectionFilter = (value: string) => { setFilter(value); setLimit(24); };
  return <div className={`collection ${shop ? 'collection--shop' : 'collection--locker'}`}>
    {shop && <>
      <div className="collection-section-title"><span><Sparkles size={16} />{tr('In the spotlight')}</span><small>{tr('Big personalities. Pocket size.')}</small></div>
      <div className="collection-featured">
        {HEROES.filter((entry) => entry.shop.featured).map((entry) => <HeroCard key={entry.id} hero={entry} economy={data} selected={selected === entry.id} onSelect={() => select(entry.id)} featured />)}
      </div>
    </>}
    <div className="collection-heading"><div><span className="collection-eyebrow">{tr(shop ? 'MAKE ROOM FOR A NEW FAVORITE' : 'YOUR PERSONAL LINEUP')}</span><h2>{tr(shop ? 'The collection' : 'Make it yours.')}<span>{HEROES.length}</span></h2></div><div className="collection-progress"><span><Gem size={15} />{tr(`${ownedCount} of ${HEROES.length} collected`)}</span><div role="progressbar" aria-label={tr('Hero collection')} aria-valuenow={ownedCount} aria-valuemin={0} aria-valuemax={HEROES.length}><i style={{ width: `${ownedCount / HEROES.length * 100}%` }} /></div></div></div>
    <div className="collection-layout">
      <div className="collection-catalog">
        <nav className="collection-categories" aria-label={tr('Customization categories')}>{categories.map(([id, label]) => <button key={id} aria-pressed={category === id} onClick={() => chooseCategory(id!)}>{tr(label)}</button>)}</nav>
          <div className="collection-tools"><div className="collection-filters" role="group" aria-label={tr('Hero collection')}>
            {[['all', 'All'], ['owned', 'Owned'], ['missing', 'Not owned'], ['affordable', 'Can unlock'], ...(category === 'heroes' ? [['new', 'New']] : [])].map(([id, label]) => <button key={id} aria-pressed={filter === id} onClick={() => setCollectionFilter(id!)}>{tr(label)}</button>)}
          </div><label className="collection-search"><Search size={16} /><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setLimit(24); }} placeholder={tr('Search collection')} aria-label={tr('Find a hero')} />{query && <button aria-label={tr('Clear search')} onClick={() => setQuery('')}><X size={14} /></button>}</label></div>
          <div className="collection-refine"><label>{tr('Rarity')}<select value={rarity} onChange={(event) => setRarity(event.target.value)}>{[['all', 'Any rarity'], ['common', 'Common'], ['rare', 'Rare'], ['epic', 'Epic'], ['legendary', 'Legendary']].map(([value, name]) => <option key={value} value={value}>{tr(name)}</option>)}</select></label><label>{tr('Sort')}<select value={sort} onChange={(event) => setSort(event.target.value)}>{[['collection', 'Collection order'], ['rarity', 'Rarest first'], ['price-up', 'Price: low to high'], ['price-down', 'Price: high to low'], ['name', 'Name']].map(([value, name]) => <option key={value} value={value}>{tr(name)}</option>)}</select></label><span aria-live="polite">{category === 'heroes' ? visible.length : visibleCosmetics.length} {tr('found')}</span></div>
        {category === 'heroes' ? <>
          <div className="collection-grid">
            {visible.slice(0, limit).map((entry) => <HeroCard key={entry.id} hero={entry} economy={data} selected={hero.id === entry.id} onSelect={() => select(entry.id)} />)}
          </div>
          {!visible.length && <div className="collection-empty"><Search size={26} /><h3>{tr('No heroes here yet')}</h3><p>{tr('Try another name. Your next favorite is close.')}</p><button className="collection-button" onClick={resetFilters}>{tr('Explore all heroes')}<ArrowRight size={16} /></button></div>}
          {visible.length > limit && <button className="collection-more" onClick={() => setLimit((value) => value + 24)}>{tr('Show more heroes')}<ChevronRight size={16} /></button>}
        </> : <>
          {category === 'styles' ? <div className="collection-form-heroes" role="group" aria-label={tr('Choose a hero')}><button aria-pressed={styleHero === 'all'} onClick={() => setStyleHero('all')}>{tr('All heroes')}</button>{HEROES.filter((entry) => entry.category !== 'originals').map((entry) => <button key={entry.id} aria-pressed={styleHero === entry.id} onClick={() => setStyleHero(entry.id)}>{tr(entry.name)}</button>)}</div> : <div className="collection-slot-heading"><span>{tr(category === 'gear' ? 'Signature weapons. Distinct strikes.' : category === 'looks' ? 'Coats, hair and auras for the original crew.' : 'Worn on your card, the ladder and the versus screen.')}</span></div>}
          {visibleCosmetics.length ? <div className="collection-cosmetics">
            {visibleCosmetics.map((entry) => { const state = cosmeticState(entry, data); return <button key={entry.id} className={`cosmetic-tile ${item.id === entry.id ? 'is-selected' : ''}`} aria-pressed={item.id === entry.id} onClick={() => select(entry.id)}>
              {entry.slot === 'weapon' ? <div className="gear-display"><GearArt id={entry.id} /><span className="gear-display__orbit" /></div>
                : entry.slot === 'title' ? <div className="identity-display"><span className="identity-display__title" style={{ '--title-color': entry.color } as React.CSSProperties}>{tr(entry.name)}</span></div>
                : entry.slot === 'banner' ? <div className="identity-display"><BannerSwatch itemId={entry.id} className="identity-display__banner" /></div>
                : entry.slot === 'skin' ? <HeroScene size={150} loadout={{ body: entry.heroId, skin: entry.id }} />
                : <HeroScene size={150} loadout={{ body: 'cloud', [entry.slot]: entry.id }} />}
              <strong>{tr(entry.name)}</strong><span>{state.equipped ? <><Check size={13} />{tr('Equipped')}</> : state.owned ? tr('Owned') : entry.exclusive ? <><Sparkles size={13} />{tr(EXCLUSIVE_SOURCE[entry.exclusive])}</> : state.locked ? <><LockKeyhole size={13} />{tr(`Level ${entry.level}`)}</> : <><CoinIcon size={17} />{entry.price || tr('Free')}</>}</span>
            </button>; })}
          </div> : <div className="collection-empty"><Search size={26} /><h3>{tr('No matching collectibles')}</h3><p>{tr('Try another name. Your next favorite is close.')}</p><button className="collection-button" onClick={resetFilters}>{tr('Reset filters')}<ArrowRight size={16} /></button></div>}
        </>}
        <p className="collection-note"><Check size={13} />{tr('Collect your favorites. Every hero plays fair.')}</p>
      </div>
      {!compact && <aside className="collection-preview"><HeroPreview item={item} onSelect={select} /></aside>}
    </div>
    {compact && <Dialog className="hero-dialog" open={detailOpen} onClose={() => setDetailOpen(false)} title={tr(hero.name)}><HeroPreview item={item} onSelect={select} /><button className="hero-dialog__back" onClick={() => setDetailOpen(false)}>{tr('Keep exploring')}<ArrowRight size={16} /></button></Dialog>}
    <span className="sr-only" role="status">{feedback?.kind === 'buy' ? tr('Added to your locker') : feedback?.kind === 'equip' ? tr('Equipped') : ''}</span>
  </div>;
}
