import { useEffect, useState } from 'react';
import { ArrowRight, Check, LockKeyhole, Play, RotateCcw, Sparkles } from 'lucide-react';
import { COSMETICS, HERO_SKINS, cosmeticState, gearById, heroById, previewItem, type CosmeticItem, type CosmeticSlot } from '@battle/shared';
import { useEconomy } from '../../hooks/useEconomy.js';
import { tr } from '../../i18n/index.js';
import { CoinIcon } from '../currency/Coins.js';
import { HeroScene, heroStyle } from './HeroScene.js';
import { Rarity } from './HeroCard.js';
import type { HeroPose } from './Hero.js';

export const SLOT_NAMES: Partial<Record<CosmeticSlot, string>> = { skin: 'Style', outfit: 'Outfit', hair: 'Hair', accessory: 'Face', weapon: 'Gear', aura: 'Aura', finisher: 'Finisher' };

export function HeroPreview({ item, onSelect }: { item: CosmeticItem; onSelect: (id: string) => void }) {
  const { data, busy, error, feedback, act } = useEconomy();
  const [reaction, setReaction] = useState(0);
  const [reacting, setReacting] = useState(false);
  useEffect(() => {
    setReacting(true);
    const timeout = setTimeout(() => setReacting(false), 1100);
    return () => clearTimeout(timeout);
  }, [reaction, item.id]);
  if (!data) return null;
  const preview = previewItem(data.loadout, item);
  if (item.slot === 'body') delete preview.skin;
  const hero = heroById(preview.body);
  const gear = item.slot === 'weapon' ? gearById(item.id) : null;
  const state = cosmeticState(item, data);
  const classicEquipped = item.slot === 'body' && state.equipped && Boolean(data.loadout.skin);
  const equipped = state.equipped && !classicEquipped;
  const reward = feedback?.itemId === item.id && ['buy', 'equip'].includes(feedback.kind);
  const pose: HeroPose = reward ? feedback.kind === 'buy' ? 'unlock' : 'victory' : reacting ? item.slot === 'weapon' ? 'attack' : item.slot === 'finisher' ? 'victory' : 'select' : 'idle';
  const skins = HERO_SKINS.filter((skin) => skin.heroId === hero.id);
  const removable = equipped && (['skin', 'accessory', 'aura', 'finisher'].includes(item.slot) || (item.slot === 'weapon' && item.id !== 'mitten'));
  const selectClassic = () => onSelect(hero.id);
  const activate = () => void act(classicEquipped ? 'unequip' : state.owned ? 'equip' : 'buy', classicEquipped ? 'skin' : item.id);
  return <section className="hero-preview" style={heroStyle(hero)} aria-label={tr('Hero preview')}>
    <div className="hero-preview__stage">
      <div className="hero-preview__eyebrow"><span>{tr(reward ? feedback.kind === 'buy' ? 'New unlock!' : 'Ready for the next round' : 'Up close')}</span><span>#{hero.shop.number}</span></div>
      <HeroScene key={`${item.id}:${reaction}:${reward ? feedback.id : 'preview'}`} loadout={preview} size={300} animated pose={pose}>
        {reward && <span className="hero-reward" aria-hidden="true">{Array.from({ length: 6 }, (_, i) => <i key={i} style={{ rotate: `${i * 60}deg` }} />)}</span>}
      </HeroScene>
      <button className="hero-preview__react" onClick={() => setReaction((value) => value + 1)} aria-label={tr('Preview animation')}><Play size={13} fill="currentColor" />{tr(gear ? 'Test strike' : 'Say hello')}</button>
    </div>
    <div className="hero-preview__details">
      <Rarity value={item.rarity} />
      <h2>{tr(gear?.name ?? hero.name)}</h2>
      <p className="hero-preview__description">{tr(gear?.description ?? hero.description)}</p>
      <div className="hero-preview__traits">{hero.tags.map((tag) => <span key={tag}>{tr(tag)}</span>)}</div>
      {!gear && skins.length > 0 && <div className="hero-styles"><div><b>{tr('Choose a style')}</b><span>{tr(item.slot === 'skin' ? item.name : 'Classic')}</span></div><div className="hero-styles__options" role="group" aria-label={tr('Choose a style')}>
        <button onClick={selectClassic} aria-pressed={!preview.skin} aria-label={tr('Classic')} style={{ '--swatch': hero.visual.accent } as React.CSSProperties}><i />{!preview.skin && <Check size={15} />}</button>
        {skins.map((skin) => <button key={skin.id} onClick={() => onSelect(skin.id)} aria-pressed={preview.skin === skin.id} aria-label={`${tr(skin.name)}, ${tr(data.owned.includes(skin.id) ? 'Owned' : 'Locked')}`} style={{ '--swatch': skin.color } as React.CSSProperties}><i />{preview.skin === skin.id ? <Check size={15} /> : !data.owned.includes(skin.id) ? <LockKeyhole size={11} /> : null}</button>)}
      </div></div>}
      {item.slot !== 'body' && <div className="hero-preview__cosmetic"><Sparkles size={16} /><span><small>{tr(SLOT_NAMES[item.slot] ?? item.slot)}</small><b>{tr(item.name)}</b></span><Rarity value={item.rarity} /></div>}
      <div className="hero-preview__action">
        <div className="hero-preview__ownership"><span>{tr(state.owned ? 'In your collection' : 'Add to your collection')}</span>{state.owned ? <Check size={16} /> : <span><CoinIcon size={20} /><b>{item.price}</b></span>}</div>
        <button className={`collection-button ${equipped ? 'is-equipped' : ''}`} disabled={busy || equipped || state.locked || state.comingSoon || state.requiresHero || (!state.owned && !state.affordable)} onClick={activate}>
          {busy ? <><span className="collection-spinner" />{tr('Saving…')}</> : state.comingSoon ? tr('Coming soon') : state.requiresHero ? <><LockKeyhole size={16} />{tr('Hero required')}</> : state.locked ? <><LockKeyhole size={16} />{tr(`Unlocks at level ${item.level}`)}</> : equipped ? <><Check size={17} />{tr('Equipped')}</> : state.owned ? <>{tr('Equip look')}<ArrowRight size={17} /></> : <>{tr(item.price ? 'Unlock' : 'Claim it')}<span><CoinIcon size={18} />{item.price || tr('Free')}</span></>}
        </button>
        {!state.owned && !state.affordable && !state.requiresHero && <p className="hero-preview__hint">{tr(`${item.price - data.coins} more coins to unlock`)} <a href="/play">{tr('Earn in battle')}<ArrowRight size={12} /></a></p>}
        {state.requiresHero && <button className="hero-preview__link" onClick={() => onSelect(item.heroId!)}>{tr('Meet the hero')}<ArrowRight size={14} /></button>}
        {removable && <button className="hero-preview__link" disabled={busy} onClick={async () => { if (await act('unequip', item.slot)) selectClassic(); }}><RotateCcw size={13} />{tr(item.slot === 'skin' ? 'Back to classic' : 'Take it off')}</button>}
        {error && <p className="error-text" role="alert">{tr(error)} <button className="hero-preview__link" onClick={activate} disabled={busy}>{tr('Try again')}</button></p>}
        <span className="hero-preview__fair">{tr('All style. Same fair game.')}</span>
      </div>
    </div>
  </section>;
}

export function cosmeticsForHero(body: string | undefined, category: string) {
  return COSMETICS.filter((item) => {
    if (category === 'styles') return item.slot === 'skin' && (!body || body === 'all' || item.heroId === body);
    return category === 'gear' && item.slot === 'weapon';
  });
}
