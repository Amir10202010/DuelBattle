import type { CSSProperties } from 'react';
import { CHESTS, cosmetic, type ChestId, type Granted, type Reward } from '@battle/shared';
import { tr, useUiPreferences } from '../../i18n/index.js';
import { CoinIcon } from '../currency/Coins.jsx';
import { Hero } from '../avatar/Hero.jsx';
import { GemIcon, PassIcon } from './Currency.jsx';

const CHEST_COLORS: Record<ChestId, { lid: string; body: string; band: string; glow: string }> = {
  battle: { lid: '#c98b55', body: '#a8693a', band: '#f3d27a', glow: '#ffd36d' },
  rare: { lid: '#4f8fe0', body: '#2f68b8', band: '#bfe6ff', glow: '#7fd1f5' },
  epic: { lid: '#9b6be8', body: '#6f45c0', band: '#ffd6ff', glow: '#c39bff' },
};

/** A chest, drawn: lid, body, a metal band and a lock that glows by rarity. */
export function ChestArt({ id, size = 56, open = false }: { id: ChestId; size?: number; open?: boolean }) {
  const c = CHEST_COLORS[id];
  return (
    <svg className={`chest-art chest-art--${id} ${open ? 'is-open' : ''}`} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" style={{ '--chest-glow': c.glow } as CSSProperties}>
      <ellipse cx="32" cy="57" rx="22" ry="4" fill="#000" opacity=".18" />
      <path className="chest-art__body" d="M9 30h46v20a4 4 0 0 1-4 4H13a4 4 0 0 1-4-4Z" fill={c.body} stroke="#2a1f14" strokeWidth="2.2" />
      <path d="M9 38h46" stroke="#2a1f14" strokeWidth="2" opacity=".35" />
      <g className="chest-art__lid">
        <path d="M9 30v-6c0-8 6-14 14-14h18c8 0 14 6 14 14v6Z" fill={c.lid} stroke="#2a1f14" strokeWidth="2.2" />
        <path d="M14 22c2-5 6-7 11-7" stroke="#fff" strokeOpacity=".35" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      </g>
      <path d="M27 10v44M37 10v44" stroke={c.band} strokeWidth="3" opacity=".9" />
      <rect x="27" y="26" width="10" height="12" rx="2" fill={c.band} stroke="#2a1f14" strokeWidth="2" />
      <circle className="chest-art__lock" cx="32" cy="32" r="2" fill="#2a1f14" />
    </svg>
  );
}

/** A banner item, as a swatch: its two colours and its pattern. */
export function BannerSwatch({ itemId, className = '' }: { itemId: string; className?: string }) {
  const item = cosmetic(itemId);
  return (
    <span
      className={`banner-swatch banner-pattern--${item?.pattern ?? 'stripes'} ${className}`}
      style={{ '--banner-a': item?.color ?? '#333', '--banner-b': item?.secondary ?? '#777' } as CSSProperties}
      aria-hidden="true"
    />
  );
}

/** The picture for one reward, at chip size. */
export function RewardIcon({ reward, size = 30 }: { reward: Reward | Granted; size?: number }) {
  switch (reward.kind) {
    case 'coins':
      return <CoinIcon size={size} />;
    case 'gems':
      return <GemIcon size={size} />;
    case 'pass':
      return <PassIcon size={size} />;
    case 'chest':
      return <ChestArt id={reward.chestId} size={size + 6} />;
    case 'item': {
      const item = cosmetic(reward.itemId);
      if (!item) return null;
      if (item.slot === 'banner') return <BannerSwatch itemId={item.id} className="reward-icon__banner" />;
      if (item.slot === 'title')
        return (
          <span className="reward-icon__title" style={{ '--title-color': item.color } as CSSProperties} aria-hidden="true">
            Aa
          </span>
        );
      return <Hero loadout={{ body: 'cloud', [item.slot]: item.id }} size={size + 12} animated={false} />;
    }
  }
}

/** Words for one reward, translated. */
export function rewardLabel(reward: Reward | Granted): string {
  switch (reward.kind) {
    case 'coins':
      return `${reward.amount.toLocaleString()} ${tr('coins')}`;
    case 'gems':
      return `${reward.amount.toLocaleString()} ${tr('gems')}`;
    case 'pass':
      return `${reward.amount.toLocaleString()} ${tr('pass XP')}`;
    case 'chest':
      return tr(CHESTS[reward.chestId].name);
    case 'item':
      return tr(cosmetic(reward.itemId)?.name ?? reward.itemId);
  }
}

const RARITY_BY_KIND = (reward: Reward | Granted) =>
  reward.kind === 'item' ? cosmetic(reward.itemId)?.rarity ?? 'common' : reward.kind === 'chest' ? CHESTS[reward.chestId].rarity : 'common';

export function RewardChip({ reward, compact = false }: { reward: Reward | Granted; compact?: boolean }) {
  useUiPreferences();
  const duplicate = reward.kind === 'item' && 'duplicate' in reward && reward.duplicate;
  return (
    <span className={`reward-chip reward-chip--${reward.kind} is-${RARITY_BY_KIND(reward)} ${compact ? 'reward-chip--compact' : ''}`} title={rewardLabel(reward)}>
      <span className="reward-chip__icon">
        <RewardIcon reward={reward} size={compact ? 20 : 28} />
      </span>
      <span className="reward-chip__label">
        {compact && (reward.kind === 'coins' || reward.kind === 'gems' || reward.kind === 'pass')
          ? `+${reward.amount.toLocaleString()}`
          : rewardLabel(reward)}
        {duplicate && <small>{tr(`Owned · +${duplicate.coins} coins`)}</small>}
      </span>
    </span>
  );
}
