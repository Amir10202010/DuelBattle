import { tr, useUiPreferences } from '../i18n/index.js';
import { ArrowRight, LockKeyhole, RefreshCw } from 'lucide-react';
import { RankEmblem } from './GameArt.jsx';

/**
 * The shape of the home screen before it has any data in it.
 *
 * Deliberately the same composition as the real page — one wide band, a row of
 * tiles, two columns — so the content lands where the eye is already looking
 * instead of appearing somewhere new.
 */
export function Skeleton({ label = 'Getting your game ready' }: { label?: string }) {
  useUiPreferences();
  return (
    <main className="page loading-page" aria-busy="true" role="status" aria-label={tr(label)}>
      <span className="skel loading-page__band" />
      <div className="loading-page__tiles">
        {Array.from({ length: 5 }, (_, i) => (
          <span className="skel" key={i} />
        ))}
      </div>
      <div className="loading-page__cols">
        <span className="skel" />
        <span className="skel" />
      </div>
      <span className="sr-only">{tr(label)}</span>
    </main>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  useUiPreferences();
  return (
    <main className="page page--narrow">
      <div className="blank" role="alert">
        <RefreshCw size={28} />
        <h1>{tr('Let’s try that again.')}</h1>
        <p>{tr(message)}</p>
        <button className="btn btn--primary" onClick={onRetry}>
          <RefreshCw size={16} />
          {tr('Retry')}
        </button>
      </div>
    </main>
  );
}

export function AuthGate({
  feature,
  onNavigate,
}: {
  feature: string;
  onNavigate: (path: string) => void;
}) {
  useUiPreferences();
  return (
    <main className="page page--narrow">
      <section className="unlock plate">
        <RankEmblem size={124} />
        <span className="eyebrow">
          <LockKeyhole size={12} />
          {tr(feature)}
        </span>
        <h1 className="display">{tr('Keep your progress')}</h1>
        <p>{tr('Ranks, rewards, your hero and your battle history all need a player.')}</p>
        <button className="btn btn--primary btn--lg" onClick={() => onNavigate('/register')}>
          {tr('Create your player')}
          <ArrowRight size={17} />
        </button>
        <button className="text-link" onClick={() => onNavigate('/login')}>
          {tr('Already a player? Sign in')}
        </button>
        <a
          className="unlock__guest"
          href="/play"
          onClick={(e) => {
            e.preventDefault();
            onNavigate('/play');
          }}
        >
          {tr('Keep playing as a guest')}
        </a>
      </section>
    </main>
  );
}
