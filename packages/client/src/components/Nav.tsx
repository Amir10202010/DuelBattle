import { Fragment } from 'react';
import { tr, useUiPreferences } from '../i18n/index.js';
import {
  ArrowRight,
  BarChart3,
  Gem,
  Gift,
  House,
  Settings,
  ShoppingBag,
  Swords,
  Ticket,
  Trophy,
  UserRound,
} from 'lucide-react';
import { levelFor, rankFor, isPlaced, type PublicProfile } from '@battle/shared';
import { pagePath, type Page } from '../hooks/useRoute.js';
import { AudioControls } from './AudioControls.jsx';
import { useEconomy } from '../hooks/useEconomy.js';
import { Wallet } from './meta/Currency.jsx';
import { useOptionalMeta } from '../hooks/useMeta.js';
import { Hero } from './avatar/Hero.jsx';
import { LandingNav } from './landing/LandingNav.js';
import { BrandMark } from './BrandMark.js';

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
  { page: 'pass', label: 'Season', Icon: Ticket },
  { page: 'leaderboard', label: 'Ladder', Icon: Trophy },
  { page: 'store', label: 'Store', Icon: ShoppingBag },
  { page: 'awards', label: 'Rewards', Icon: Gift },
  { page: 'profile', label: 'Locker', Icon: UserRound },
] as const;

/** On a wide screen there is room for the rank ladder too; a phone bar has six slots. */
const RAIL_EXTRAS = [{ page: 'ranks', label: 'Ranks', Icon: Gem }] as const;

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
  pass: 'Season pass',
  admin: 'Dashboard',
};

export function Nav({
  page,
  profile,
  onNavigate,
  publicOnly = false,
  pinned = false,
  mapPath = (path: string) => path,
}: {
  page: Page;
  profile: PublicProfile | null;
  onNavigate: (path: string) => void;
  publicOnly?: boolean;
  /**
   * This screen has to be finished before any other one will stay open.
   *
   * Onboarding is the only one: the app sends a player who has not completed
   * it straight back, so a header link is a button that visibly does nothing.
   * The brand stays, as a mark rather than a link.
   */
  pinned?: boolean;
  mapPath?: (path: string) => string;
}) {
  useUiPreferences();
  const { data: economy } = useEconomy();
  const meta = useOptionalMeta();
  if (publicOnly && page === 'home') {
    return <LandingNav signedIn={Boolean(profile)} onNavigate={onNavigate} />;
  }
  const go = (path: string) => (e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    onNavigate(path);
  };
  const wordmark = (
    <>
      <span className="wordmark__mark">
        <BrandMark />
      </span>
      <span className="wordmark__text">
        {'DUEL'}
        <span>{'BATTLE'}</span>
      </span>
    </>
  );
  const brand = pinned ? (
    <span className="wordmark">{wordmark}</span>
  ) : (
    <a
      className="wordmark"
      href={mapPath(profile ? '/home' : '/')}
      onClick={go(profile ? '/home' : '/')}
      aria-label={tr('DuelBattle home')}
    >
      {wordmark}
    </a>
  );

  if (publicOnly)
    return (
      <header className="public-nav">
        {brand}
        <div>
          {pinned ? null : profile ? (
            <a className="btn btn--primary" href={mapPath("/home")} onClick={go('/home')}>
              {tr('Enter home')}
              <ArrowRight size={16} />
            </a>
          ) : (
            <>
              <a className="text-link" href={mapPath("/login")} onClick={go('/login')}>
                {tr('Sign in')}
              </a>
              <a className="btn btn--primary" href={mapPath("/register")} onClick={go('/register')}>
                {tr('Create player')}
                <ArrowRight size={16} />
              </a>
            </>
          )}
        </div>
      </header>
    );

  const level = profile ? levelFor(profile.xp).level : 0;
  /**
   * Where something is waiting to be collected. A dot, never a number that
   * nags: it says "there is a reason to look" and nothing more.
   */
  const view = meta?.view;
  const waiting: Partial<Record<Page, boolean>> = view
    ? {
        dashboard:
          !view.calendar.claimedToday ||
          [...view.quests.daily, ...view.quests.weekly, ...view.quests.starter].some((q) => q.done && !q.claimed),
        pass: view.season.tiers.some((t) => t.reached && (!t.freeClaimed || (view.season.premium && !t.premiumClaimed))),
      }
    : {};
  const railLinks = [...LINKS, ...RAIL_EXTRAS, ...(view?.admin ? [{ page: 'admin', label: 'Dashboard', Icon: BarChart3 } as const] : [])];

  return (
    <>
      <aside className="rail">
        <div className="rail__brand">{brand}</div>
        <a
          className={`rail__play ${page === 'play' ? 'is-current' : ''}`}
          href={mapPath("/play")}
          onClick={go('/play')}
        >
          <Swords size={21} strokeWidth={2.2} />
          <span>{tr('Battle')}</span>
        </a>
        <nav className="rail__nav" aria-label={tr('Main navigation')}>
          {railLinks.map(({ page: to, label, Icon }) => (
            <a
              key={to}
              className={`rail__link ${page === to ? 'is-current' : ''} ${waiting[to] ? 'has-dot' : ''}`}
              href={mapPath(pagePath(to))}
              onClick={go(pagePath(to))}
              aria-current={page === to ? 'page' : undefined}
            >
              <Icon size={20} strokeWidth={1.9} />
              <span>{tr(label)}</span>
              {waiting[to] && <i className="nav-dot" aria-label={tr('Something to collect')} />}
            </a>
          ))}
        </nav>
        <div className="rail__foot">
          <a
            className={`rail__link ${page === 'settings' ? 'is-current' : ''}`}
            href={mapPath("/settings")}
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
              <Wallet coins={economy.coins} gems={economy.gems ?? 0} onNavigate={onNavigate} mapPath={mapPath} />
            ) : (
              <span className="skel topbar__coins-skel" aria-hidden="true" />
            ))}
          <AudioControls />
          {profile ? (
            <a
              className={`topbar__player ${page === 'profile' ? 'is-current' : ''}`}
              href={mapPath("/profile")}
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
                  <Hero loadout={economy?.loadout ?? profile.loadout} size={38} animated={false} portrait />
                </span>
                <b className="num">{level}</b>
              </span>
            </a>
          ) : (
            <a className="btn btn--primary btn--sm" href={mapPath("/login")} onClick={go('/login')}>
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
                href={mapPath("/play")}
                onClick={go('/play')}
                aria-current={page === 'play' ? 'page' : undefined}
                aria-label={tr('Battle')}
              >
                <Swords size={25} strokeWidth={2.3} />
              </a>
            )}
            <a
              href={mapPath(pagePath(to))}
              onClick={go(pagePath(to))}
              className={`tabbar__link ${page === to ? 'is-current' : ''} ${waiting[to] ? 'has-dot' : ''}`}
              aria-current={page === to ? 'page' : undefined}
            >
              <Icon size={20} strokeWidth={1.9} />
              <span>{tr(label)}</span>
              {waiting[to] && <i className="nav-dot" aria-label={tr('Something to collect')} />}
            </a>
          </Fragment>
        ))}
      </nav>
    </>
  );
}
