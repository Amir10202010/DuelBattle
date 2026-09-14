import { tr, useUiPreferences } from '../i18n/index.js';
import { ArrowRight, LockKeyhole, RefreshCw } from 'lucide-react';
import { RankEmblem } from './GameArt.jsx';

export function Skeleton({ label = 'Getting your game ready' }: { label?: string }) {
  useUiPreferences();
  return (
    <main className="page skeleton" aria-busy="true" role="status" aria-label={tr(label)}>
      <span className="skeleton__line" />
      <span className="skeleton__hero" />
      <div className="skeleton__grid">
        <span />
        <span />
        <span />
      </div>
      <span className="sr-only">{tr(label)}</span>
    </main>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  useUiPreferences();
  return (
    <main className="page">
      <div className="empty" role="alert">
        <RefreshCw size={30} />
        <h1>{tr('Let’s try that again.')}</h1>
        <p>{tr(message)}</p>
        <button className="btn btn--primary" onClick={onRetry}>
          {tr('Retry ')}
          <RefreshCw size={16} />
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
    <main className="page">
      <section className="unlock">
        <RankEmblem size={132} />
        <span className="eyebrow">
          <LockKeyhole size={13} />
          {tr(feature)}
        </span>
        <h1>{tr('Keep your progress')}</h1>
        <p>{tr('Ranks, rewards and match history need an account.')}</p>
        <button className="btn btn--primary btn--lg" onClick={() => onNavigate('/register')}>
          {tr('Create your player ')}
          <ArrowRight size={18} />
        </button>
        <button className="text-link" onClick={() => onNavigate('/login')}>
          {tr('Already a player? Sign in')}
        </button>
        <a
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
