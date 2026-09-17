import './i18n/preferences.js';
import '@fontsource-variable/onest';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/system.css';
import './styles/shell.css';
import './styles/screens.css';
import './styles/arena.css';
import './styles/characters.css';
import { App } from './App.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';

const container = document.getElementById('root');
if (!container) throw new Error('missing #root');

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
