import { useEffect, useState } from 'react';
import { Zap } from 'lucide-react';
import { isPlaced, type PublicProfile } from '@battle/shared';
import { pagePath, type Page } from '../hooks/useRoute.js';
import { Avatar, RankBadge } from './Identity.jsx';

/**
 * The way around.
 *
 * Six links and a card, which is the most a game this size can carry without
 * turning its front page into a control panel. Everything here is somewhere a
 * player goes *between* matches; nothing about a live match is reachable from
 * it, because a match has one exit and it is called Leave.
 *
 * Play is a button rather than a link. It is the only thing on this bar anybody
 * came here to do, and a row of seven identical words hides that.
 */
const LINKS: { page: Page; label: string }[] = [
  { page: 'leaderboard', label: 'Leaderboard' },
  { page: 'ranks', label: 'Ranks' },
  { page: 'awards', label: 'Awards' },
  { page: 'profile', label: 'Profile' },
];

interface NavProps {
  page: Page;
  profile: PublicProfile | null;
  onNavigate: (path: string) => void;
}

export function Nav({ page, profile, onNavigate }: NavProps) {
  const [open, setOpen] = useState(false);

  // A navigation that stays open over the page it navigated to is a navigation
  // nobody can read the result of.
  useEffect(() => {
    setOpen(false);
  }, [page]);

  const go = (to: Page) => (event: React.MouseEvent) => {
    // Leave modified clicks to the browser: a middle click or a cmd-click on a
    // link means "open this somewhere else", and these are real links.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    onNavigate(pagePath(to));
  };

  const played = (profile?.matchesPlayed ?? 0) > 0;

  return (
    <header className={`nav ${open ? 'nav--open' : ''}`}>
      <div className="nav__bar">
        <a className="wordmark" href={pagePath('home')} onClick={go('home')}>
          <span className="wordmark__mark" aria-hidden="true">
            <Zap size={19} fill="currentColor" strokeWidth={2.5} />
          </span>
          DUEL<span className="wordmark__half">BATTLE</span>
        </a>

        <nav className="nav__links" aria-label="Main">
          {LINKS.map((link) => (
            <a
              key={link.page}
              className={`nav__link ${page === link.page ? 'is-current' : ''}`}
              href={pagePath(link.page)}
              aria-current={page === link.page ? 'page' : undefined}
              onClick={go(link.page)}
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="nav__right">
          {profile && played && (
            <a className="nav__me" href={pagePath('profile')} onClick={go('profile')}>
              <RankBadge rating={profile.rating} placed={isPlaced(profile.matchesPlayed)} size="sm" />
              <Avatar avatar={profile.avatar} size={30} name={profile.name} />
            </a>
          )}
          <a className="btn btn--primary nav__play" href={pagePath('play')} onClick={go('play')}>
            Play
          </a>
          <button
            type="button"
            className="nav__toggle"
            aria-expanded={open}
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((was) => !was)}
          >
            <span aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* On a phone the links move below the bar rather than into a drawer that
          covers the page: there are five of them, and a full-screen overlay for
          five words is a lot of ceremony. */}
      <nav className="nav__drawer" aria-label="Main, expanded" hidden={!open}>
        {[...LINKS, { page: 'settings' as const, label: 'Settings' }].map((link) => (
          <a
            key={link.page}
            className={`nav__drawerlink ${page === link.page ? 'is-current' : ''}`}
            href={pagePath(link.page)}
            onClick={go(link.page)}
          >
            {link.label}
          </a>
        ))}
      </nav>
    </header>
  );
}
