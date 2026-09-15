import { tr, useUiPreferences } from '../i18n/index.js';
import {
  Home,
  Swords,
  Trophy,
  Gem,
  Gift,
  Settings,
  ArrowRight,
  Zap,
  UserRound,
} from 'lucide-react';
import { levelFor, type PublicProfile } from '@battle/shared';
import { pagePath, type Page } from '../hooks/useRoute.js';
import { Avatar } from './Identity.jsx';
import { AudioControls } from './AudioControls.jsx';

const LINKS = [
  { page: 'dashboard', label: 'Home', Icon: Home },
  { page: 'play', label: 'Battle', Icon: Swords },
  { page: 'leaderboard', label: 'Leaderboard', Icon: Trophy },
  { page: 'awards', label: 'Rewards', Icon: Gift },
  { page: 'ranks', label: 'Ranks', Icon: Gem },
  { page: 'profile', label: 'Profile', Icon: UserRound },
] as const;
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
        <Zap size={22} fill="currentColor" />
      </span>
      <span>
        {tr('DUEL')}
        <span className="wordmark__half">{tr('BATTLE')}</span>
      </span>
    </a>
  );
  if (publicOnly)
    return (
      <header className="public-nav">
        {tr(brand)}
        <span className="public-nav__note">{tr('Your room is the game.')}</span>
        <div>
          <AudioControls />
          {profile ? (
            <a className="btn btn--primary" href="/home" onClick={go('/home')}>
              {tr('Enter home ')}
              <ArrowRight size={16} />
            </a>
          ) : (
            <>
              <a className="text-link" href="/login" onClick={go('/login')}>
                {tr('Sign in')}
              </a>
              <a className="btn btn--primary" href="/register" onClick={go('/register')}>
                {tr('Join the arena ')}
                <ArrowRight size={16} />
              </a>
            </>
          )}
        </div>
      </header>
    );
  return (
    <>
      <aside className="game-rail">
        {tr(brand)}
        <nav aria-label={tr('Main navigation')}>
          {LINKS.map(({ page: to, label, Icon }) => (
            <a
              key={to}
              className={`rail-link ${page === to ? 'is-current' : ''}`}
              href={pagePath(to)}
              onClick={go(pagePath(to))}
              aria-current={page === to ? 'page' : undefined}
              title={tr(label)}
            >
              <Icon size={21} strokeWidth={1.8} />
              <span>{tr(label)}</span>
              {to === 'play' && <i />}
            </a>
          ))}
        </nav>
        <div className="rail-bottom">
          <a
            className={`rail-link ${page === 'settings' ? 'is-current' : ''}`}
            href="/settings"
            onClick={go('/settings')}
            title={tr('Settings')}
          >
            <Settings size={21} />
            <span>{tr('Settings')}</span>
          </a>
          <span className="rail-caption">
            {tr('PLAY FAIR.')}
            <br />
            {tr('PLAY AGAIN.')}
          </span>
        </div>
      </aside>
      <header className="game-topbar">
        <div className="mobile-brand">{tr(brand)}</div>
        <div className="location-label">
          <span>{tr('THE ARENA')}</span>
          <i>{'/'}</i>
          <strong>{tr(LINKS.find((l) => l.page === page)?.label ?? 'Settings')}</strong>
        </div>
        <div className="topbar-right">
          <AudioControls />
          {profile ? (
            <a className="topbar-player" href="/profile" onClick={go('/profile')}>
              <div>
                <strong>{profile.name}</strong>
                <span>
                  {tr('Level ')}
                  {tr(levelFor(profile.xp).level)}
                </span>
              </div>
              <Avatar avatar={profile.avatar} name={profile.name} size={36} />
            </a>
          ) : (
            <a className="btn btn--primary" href="/login" onClick={go('/login')}>
              {tr('Sign in ')}
              <ArrowRight size={15} />
            </a>
          )}
        </div>
      </header>
      <nav className="bottom-nav" aria-label={tr('Mobile navigation')}>
        {LINKS.filter((l) => l.page !== 'ranks').map(({ page: to, label, Icon }) => (
          <a
            key={to}
            href={pagePath(to)}
            onClick={go(pagePath(to))}
            className={page === to ? 'is-current' : ''}
            aria-current={page === to ? 'page' : undefined}
          >
            <Icon size={20} />
            <span>{tr(label === 'Leaderboard' ? 'Ladder' : label)}</span>
          </a>
        ))}
      </nav>
    </>
  );
}
