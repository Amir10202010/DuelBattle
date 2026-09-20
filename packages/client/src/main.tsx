import './i18n/preferences.js';
import '@fontsource-variable/onest';
import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/system.css';
import './styles/shell.css';
import './styles/screens.css';
import './styles/arena.css';
import './styles/characters.css';
import './styles/heroes.css';
import { App } from './App.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';

/** A shared game UI, with Telegram authentication and navigation loaded on demand. */
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
