import './i18n/preferences.js';
import '@fontsource-variable/onest';
import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/system.css';
import './styles/shell.css';
import './styles/screens.css';
import './styles/arena.css';
import './styles/characters.css';
import { App } from './App.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';

/**
 * Two front doors, one build.
 *
 * `/tg` is the Telegram Mini App: its own root, its own shell, its own
 * navigation, because a Mini App has no address bar, no landing page and no
 * room for a footer. Everything below it — the socket, the store, the design
 * tokens, and the arena a duel is actually played in — is the same code the
 * web app runs.
 *
 * Loaded lazily so a browser visiting the ordinary game never downloads the
 * Mini App — its stylesheet travels inside the same chunk — and the Mini App
 * never downloads the landing page.
 */
const TelegramApp = lazy(() =>
  import('./telegram/TelegramApp.jsx').then((m) => ({ default: m.TelegramApp })),
);

const isTelegram =
  location.pathname === '/tg' || location.pathname.startsWith('/tg/');

const container = document.getElementById('root');
if (!container) throw new Error('missing #root');

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      {isTelegram ? (
        <Suspense fallback={<div className="tg-boot" />}>
          <TelegramApp />
        </Suspense>
      ) : (
        <App />
      )}
    </ErrorBoundary>
  </StrictMode>,
);
