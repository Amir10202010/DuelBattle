import { memo } from 'react';
import { ArrowUpRight, Check, LockKeyhole, Sparkles } from 'lucide-react';
import { cosmetic, cosmeticState, type EconomyView, type HeroDefinition } from '@battle/shared';
import { tr } from '../../i18n/index.js';
import { CoinIcon } from '../currency/Coins.js';
import { HeroScene, heroStyle } from './HeroScene.js';

export function Rarity({ value }: { value: HeroDefinition['rarity'] }) {
  return <span className={`hero-rarity hero-rarity--${value}`}><i aria-hidden="true" />{tr(value)}</span>;
}

export const HeroCard = memo(function HeroCard({ hero, economy, selected, onSelect, featured = false }: {
  hero: HeroDefinition; economy: EconomyView; selected: boolean; onSelect: () => void; featured?: boolean;
}) {
  const state = cosmeticState(cosmetic(hero.id)!, economy);
  const label = state.comingSoon ? 'Coming soon' : state.equipped ? 'Equipped' : state.owned ? 'Owned' : state.locked ? 'Locked' : null;
  return <button type="button" className={`hero-card ${featured ? 'hero-card--featured' : ''} ${selected ? 'is-selected' : ''} ${state.equipped ? 'is-equipped' : ''} ${state.locked || state.comingSoon ? 'is-locked' : ''}`}
    style={heroStyle(hero)} aria-pressed={selected} aria-label={`${tr(hero.name)}, ${tr(hero.rarity)}, ${label ? tr(label) : `${hero.price} ${tr('Battle coins')}`}`} onClick={onSelect}>
    <span className="hero-card__top"><Rarity value={hero.rarity} />{hero.shop.isNew && <span className="hero-new"><Sparkles size={11} />{tr('New')}</span>}<span className="hero-card__number">{hero.shop.number}</span></span>
    <HeroScene loadout={{ body: hero.id }} size={featured ? 280 : 190} />
    <span className="hero-card__info"><strong>{tr(hero.name)}</strong>{featured && <span className="hero-card__tagline">{tr(hero.title)}</span>}
      <span className="hero-card__bottom"><span className={state.equipped ? 'hero-card__equipped' : ''}>{label ? <>{state.equipped ? <Check size={14} /> : state.locked || state.comingSoon ? <LockKeyhole size={13} /> : null}{tr(label)}</> : <><CoinIcon size={18} />{hero.price}</>}</span><ArrowUpRight size={17} /></span>
    </span>
  </button>;
});
