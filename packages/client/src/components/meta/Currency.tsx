import { useAnimatedNumber } from '../../hooks/useAnimatedNumber.js';
import { tr, useUiPreferences } from '../../i18n/index.js';
import { CoinIcon } from '../currency/Coins.jsx';

/** The premium currency: a cut crystal, cool where coins are warm. */
export function GemIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" className="gem-icon">
      <path d="M12 6h16l8 10-16 20L4 16Z" fill="#3fa9d9" />
      <path d="M12 6h16l8 10H4Z" fill="#8fe3ff" />
      <path d="m12 6 3 10 5-10 5 10 3-10" fill="none" stroke="#e9fbff" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M4 16h32L20 36Z" fill="#2c7fb8" opacity=".55" />
      <path d="m15 16 5 20 5-20" fill="none" stroke="#bff2ff" strokeWidth="1.2" opacity=".8" />
      <path d="m26 9 2-3 1 3 3 1-3 1-1 3-2-3-3-1Z" fill="#ffffff" opacity=".9" />
    </svg>
  );
}

/** Season pass points: a ticket stub. */
export function PassIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" className="pass-icon">
      <path d="M6 10h28v6a4 4 0 0 0 0 8v6H6v-6a4 4 0 0 0 0-8Z" fill="#ffcf5a" stroke="#a8741c" strokeWidth="2" strokeLinejoin="round" />
      <path d="M24 12v16" stroke="#a8741c" strokeWidth="2" strokeDasharray="2 3" />
      <path d="m14 15 1.8 3.6 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4-2.9-2.8 4-.6Z" fill="#fff6d8" />
    </svg>
  );
}

export function GemCounter({ value }: { value: number }) {
  useUiPreferences();
  const shown = useAnimatedNumber(value, 480);
  return (
    <span className="gem-counter" aria-label={`${tr('Gems')}: ${value}`}>
      <GemIcon />
      <strong key={value}>{shown.toLocaleString()}</strong>
    </span>
  );
}

/**
 * Both wallets, side by side, each a way into the store.
 *
 * The plus on the gem pill is the only purchase prompt that lives outside the
 * store, and it only ever opens the store: nothing is bought from the header.
 */
export function Wallet({
  coins,
  gems,
  onNavigate,
  mapPath = (path: string) => path,
}: {
  coins: number;
  gems: number;
  onNavigate: (path: string) => void;
  mapPath?: (path: string) => string;
}) {
  useUiPreferences();
  const coinShown = useAnimatedNumber(coins, 480);
  const gemShown = useAnimatedNumber(gems, 480);
  const go = (path: string) => (event: React.MouseEvent) => {
    if (event.ctrlKey || event.metaKey || event.button !== 0) return;
    event.preventDefault();
    onNavigate(path);
  };
  return (
    <span className="wallet">
      <a className="wallet__pill wallet__pill--coins" href={mapPath('/store')} onClick={go('/store')} aria-label={`${tr('Battle coins')}: ${coins}`}>
        <CoinIcon size={22} />
        <strong key={coins}>{coinShown.toLocaleString()}</strong>
      </a>
      <a className="wallet__pill wallet__pill--gems" href={mapPath('/store#gems')} onClick={go('/store#gems')} aria-label={`${tr('Gems')}: ${gems}. ${tr('Get more gems')}`}>
        <GemIcon size={22} />
        <strong key={gems}>{gemShown.toLocaleString()}</strong>
        <i aria-hidden="true">+</i>
      </a>
    </span>
  );
}
