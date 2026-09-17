import { Fragment } from 'react';
import { tr, useUiPreferences } from '../i18n/index.js';
import {
  ArrowRight,
  Gem,
  Gift,
  House,
  Settings,
  ShoppingBag,
  Swords,
  Trophy,
  UserRound,
  Zap,
} from 'lucide-react';
import { levelFor, rankFor, isPlaced, type PublicProfile } from '@battle/shared';
import { pagePath, type Page } from '../hooks/useRoute.js';
import { AudioControls } from './AudioControls.jsx';
import { useEconomy } from '../hooks/useEconomy.js';
import { CoinCounter } from './currency/Coins.jsx';
import { Hero } from './avatar/Hero.jsx';
import { LandingNav } from './landing/LandingNav.js';

/**
 * Where a player can go, in the order they care about it.
 *
 * Every destination is in the bar on a phone too: burying rewards and ranks
 * behind another screen made two of the game's three progression surfaces feel
 * like they did not exist. Battle splits the row in half, so the three either
 * side of it stay inside a thumb's reach.
 */
const LINKS = [
  { page: 'dashboard', label: 'Home', Icon: House },
  { page: 'leaderboard', label: 'Ladder', Icon: Trophy },
  { page: 'ranks', label: 'Ranks', Icon: Gem },
  { page: 'awards', label: 'Rewards', Icon: Gift },
  { page: 'store', label: 'Store', Icon: ShoppingBag },
  { page: 'profile', label: 'Locker', Icon: UserRound },
] as const;

/** Battle sits in the middle of the bar, not at the end of the list. */
const BAR_SPLIT = 3;

const TITLES: Partial<Record<Page, string>> = {
  dashboard: 'Home',
  play: 'Battle',
  store: 'Store',
  leaderboard: 'Ladder',
  awards: 'Rewards',
  ranks: 'Ranks',
  profile: 'Locker',
  settings: 'Settings',
};

export function Nav({
  page,
  profile,
  onNavigate,
  publicOnly = false,
}: {
  page: Page;
  profile: PublicProfile | null;
  onNavigate: (path: string) => void;
  publicOnly?: boolean;
}) {
  useUiPreferences();
  const { data: economy } = useEconomy();
  if (publicOnly && page === 'home') {
    return <LandingNav signedIn={Boolean(profile)} onNavigate={onNavigate} />;
  }
  const go = (path: string) => (e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    onNavigate(path);
  };
  const brand = (
    <a
      className="wordmark"
      href={profile ? '/home' : '/'}
      onClick={go(profile ? '/home' : '/')}
      aria-label={tr('DuelBattle home')}
    >
      <span className="wordmark__mark">
        <Zap size={19} fill="currentColor" strokeWidth={0} />
      </span>
      <span className="wordmark__text">
        {'DUEL'}
        <span>{'BATTLE'}</span>
      </span>
    </a>
  );

  if (publicOnly)
    return (
      <header className="public-nav">
        {brand}
        <div>
          {profile ? (
            <a className="btn btn--primary" href="/home" onClick={go('/home')}>
              {tr('Enter home')}
              <ArrowRight size={16} />
            </a>
          ) : (
            <>
              <a className="text-link" href="/login" onClick={go('/login')}>
                {tr('Sign in')}
              </a>
              <a className="btn btn--primary" href="/register" onClick={go('/register')}>
                {tr('Create player')}
                <ArrowRight size={16} />
              </a>
            </>
          )}
        </div>
      </header>
    );

  const level = profile ? levelFor(profile.xp).level : 0;

  return (
    <>
      <aside className="rail">
        <div className="rail__brand">{brand}</div>
        <a
          className={`rail__play ${page === 'play' ? 'is-current' : ''}`}
          href="/play"
          onClick={go('/play')}
        >
          <Swords size={21} strokeWidth={2.2} />
          <span>{tr('Battle')}</span>
        </a>
        <nav className="rail__nav" aria-label={tr('Main navigation')}>
          {LINKS.map(({ page: to, label, Icon }) => (
            <a
              key={to}
              className={`rail__link ${page === to ? 'is-current' : ''}`}
              href={pagePath(to)}
              onClick={go(pagePath(to))}
              aria-current={page === to ? 'page' : undefined}
            >
              <Icon size={20} strokeWidth={1.9} />
              <span>{tr(label)}</span>
            </a>
          ))}
        </nav>
        <div className="rail__foot">
          <a
            className={`rail__link ${page === 'settings' ? 'is-current' : ''}`}
            href="/settings"
            onClick={go('/settings')}
            aria-current={page === 'settings' ? 'page' : undefined}
          >
            <Settings size={20} strokeWidth={1.9} />
            <span>{tr('Settings')}</span>
          </a>
        </div>
      </aside>

      <header className="topbar">
        <div className="topbar__left">
          <span className="topbar__brand">{brand}</span>
          <span className="topbar__where eyebrow">{tr(TITLES[page] ?? 'Home')}</span>
        </div>
        <div className="topbar__right">
          {profile &&
            (economy ? (
              <a className="topbar__coins" href="/store" onClick={go('/store')}>
                <CoinCounter value={economy.coins} />
              </a>
            ) : (
              <span className="skel topbar__coins-skel" aria-hidden="true" />
            ))}
          <AudioControls />
          {profile ? (
            <a
              className={`topbar__player ${page === 'profile' ? 'is-current' : ''}`}
              href="/profile"
              onClick={go('/profile')}
            >
              <span className="topbar__player-text">
                <strong>{profile.name}</strong>
                <small>
                  {tr(
                    isPlaced(profile.matchesPlayed)
                      ? rankFor(profile.rating).label
                      : 'Placement',
                  )}
                </small>
              </span>
              <span className="topbar__portrait">
                <span className="topbar__portrait-crop">
                  <Hero loadout={profile.loadout} size={60} />
                </span>
                <b className="num">{level}</b>
              </span>
            </a>
          ) : (
            <a className="btn btn--primary btn--sm" href="/login" onClick={go('/login')}>
              {tr('Sign in')}
            </a>
          )}
        </div>
      </header>

      <nav className="tabbar" aria-label={tr('Main navigation')}>
        {LINKS.map(({ page: to, label, Icon }, index) => (
          <Fragment key={to}>
            {index === BAR_SPLIT && (
              <a
                className={`tabbar__play ${page === 'play' ? 'is-current' : ''}`}
                href="/play"
                onClick={go('/play')}
                aria-current={page === 'play' ? 'page' : undefined}
                aria-label={tr('Battle')}
              >
                <Swords size={25} strokeWidth={2.3} />
              </a>
            )}
            <a
              href={pagePath(to)}
              onClick={go(pagePath(to))}
              className={`tabbar__link ${page === to ? 'is-current' : ''}`}
              aria-current={page === to ? 'page' : undefined}
            >
              <Icon size={20} strokeWidth={1.9} />
              <span>{tr(label)}</span>
            </a>
          </Fragment>
        ))}
      </nav>
    </>
  );
}
