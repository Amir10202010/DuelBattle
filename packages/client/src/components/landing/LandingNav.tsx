import { useRef, useState } from 'react';
import { ArrowRight, Menu, X, Zap } from 'lucide-react';
import { tr, useUiPreferences } from '../../i18n/index.js';
import { LandingLink } from './LandingLink.js';
export function LandingNav({
  signedIn,
  onNavigate,
}: {
  signedIn: boolean;
  onNavigate: (path: string) => void;
}) {
  useUiPreferences();
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  return (
    <header
      className="lp-nav"
      onKeyDown={(event) => {
        if (open && event.key === 'Escape') {
          setOpen(false);
          toggle.current?.focus();
        }
      }}
    >
      <div className="lp-wrap lp-nav__inner">
        <LandingLink
          className="lp-brand"
          href={signedIn ? '/home' : '/'}
          onNavigate={onNavigate}
          aria-label={tr('DuelBattle home')}
        >
          <span className="lp-brand__mark">
            <Zap size={21} fill="currentColor" />
          </span>
          <span>
            DUEL<span className="lp-brand__half">BATTLE</span>
          </span>
        </LandingLink>
        <nav className="lp-nav__links" aria-label={tr('Main navigation')}>
          <a href="#how-it-works">{tr('How it works')}</a>
          <a href="#ways-to-play">{tr('Ways to play')}</a>
          <a href="#trust-title">{tr('The ground rules')}</a>
        </nav>
        <div className="lp-nav__actions">
          {!signedIn && (
            <LandingLink className="lp-nav__signin" href="/login" onNavigate={onNavigate}>
              {tr('Sign in')}
            </LandingLink>
          )}
          <LandingLink
            className="lp-button lp-button--nav"
            href={signedIn ? '/home' : '/play'}
            onNavigate={onNavigate}
          >
            {tr(signedIn ? 'Enter home' : 'Let’s play')}
            <ArrowRight size={16} />
          </LandingLink>
          <button
            ref={toggle}
            className="lp-nav__toggle"
            type="button"
            aria-expanded={open}
            aria-controls="landing-menu"
            aria-label={tr(open ? 'Close navigation' : 'Open navigation')}
            onClick={() => setOpen(!open)}
          >
            {open ? <X size={21} /> : <Menu size={21} />}
          </button>
        </div>
      </div>
      {open && (
        <nav id="landing-menu" className="lp-nav__mobile" aria-label={tr('Mobile navigation')}>
          <a href="#how-it-works" onClick={() => setOpen(false)}>
            {tr('How it works')}
          </a>
          <a href="#ways-to-play" onClick={() => setOpen(false)}>
            {tr('Ways to play')}
          </a>
          <a href="#trust-title" onClick={() => setOpen(false)}>
            {tr('The ground rules')}
          </a>
          {!signedIn && (
            <LandingLink href="/login" onNavigate={onNavigate}>
              {tr('Sign in')}
            </LandingLink>
          )}
        </nav>
      )}
    </header>
  );
}
