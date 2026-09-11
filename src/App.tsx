import { useEffect, useState } from 'react';
import { Landing } from './components/Landing';
import { NameDialog } from './components/NameDialog';
import { InfoDialog } from './components/InfoDialog';
import { Battle } from './components/Battle';
import { useConnection } from './hooks/useConnection';
import { navigate, request, saveName } from './lib/client';

export function App() {
  const connection = useConnection();
  const [path, setPath] = useState(location.pathname);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<'rules' | 'privacy' | null>(null);
  useEffect(() => {
    const update = () => setPath(location.pathname);
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);
  const battle = /^\/battle\/([a-f0-9]{10})\/?$/i.exec(path);
  const title = battle
    ? `Arena ${battle[1].toUpperCase()} · DuelBattle`
    : 'DuelBattle — Your room is the arena.';
  useEffect(() => {
    document.title = title;
  }, [title]);
  const create = async (name: string, mode: 'private' | 'random') => {
    if (!connection.socket || !connection.connected) {
      setError('The arena is reconnecting. Try again in a moment.');
      return;
    }
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { code } = await request(connection.socket, mode === 'random' ? 'find' : 'create', {
        name,
      });
      saveName(name);
      setCreating(false);
      navigate(`/battle/${code}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {battle ? (
        <Battle
          key={battle[1].toUpperCase()}
          code={battle[1].toUpperCase()}
          connection={connection}
          onInfo={setInfo}
        />
      ) : path === '/' ? (
        <Landing
          profile={connection.profile}
          connected={connection.connected}
          onStart={() => {
            setError(null);
            setCreating(true);
          }}
          onJoin={(code) => navigate(`/battle/${code}`)}
          onInfo={setInfo}
        />
      ) : (
        <main className="not-found" id="main-content">
          <span className="eyebrow">404 · OUTSIDE THE ARENA</span>
          <h1>This battle no longer exists.</h1>
          <p>Check the invite link, or start a fresh rivalry.</p>
          <button className="button button-lime" onClick={() => navigate('/')}>
            Back to home
          </button>
        </main>
      )}
      <NameDialog
        open={creating}
        onClose={() => {
          if (!busy) setCreating(false);
        }}
        onSubmit={(name, mode) => void create(name, mode)}
        judgeMode={connection.profile?.judgeMode}
        busy={busy}
        error={error ?? connection.error}
        connected={connection.connected}
        onRetry={connection.retry}
      />
      <InfoDialog
        kind={info}
        onClose={() => setInfo(null)}
        judgeMode={connection.profile?.judgeMode}
      />
    </>
  );
}
