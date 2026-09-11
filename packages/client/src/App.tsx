import { useEffect, useRef, useSyncExternalStore } from 'react';
import { MatchStore } from './net/store.js';
import { useCamera } from './media/useCamera.js';
import { roomPath, useRoute } from './hooks/useRoute.js';
import { Toasts } from './components/Hud.jsx';
import { Home } from './screens/Home.jsx';
import { Room } from './screens/Room.jsx';

export function App() {
  const storeRef = useRef<MatchStore | null>(null);
  storeRef.current ??= new MatchStore();
  const store = storeRef.current;

  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const camera = useCamera();
  const route = useRoute();

  useEffect(() => {
    store.start();
    return () => store.stop();
  }, [store]);

  // Arriving on a /r/CODE link with a session for that room walks straight back in.
  const resumedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!route.code || snapshot.status !== 'open' || snapshot.screen === 'room') return;
    if (resumedFor.current === route.code) return;
    resumedFor.current = route.code;
    store.resumeSession(route.code);
  }, [route.code, snapshot.status, snapshot.screen, store]);

  // Keep the address bar in step with where the player actually is.
  useEffect(() => {
    if (snapshot.roomCode && snapshot.screen === 'room') route.go(roomPath(snapshot.roomCode));
    else if (snapshot.screen === 'home' && route.path !== '/') route.go('/');
  }, [snapshot.roomCode, snapshot.screen, route]);

  // Nothing should hold the camera open once the match is behind us.
  useEffect(() => {
    if (snapshot.screen !== 'home') return;
    if (camera.status === 'ready' || camera.status === 'requesting') camera.stop();
  }, [snapshot.screen, camera]);

  const leave = () => {
    store.leave();
    camera.stop();
    resumedFor.current = null;
    route.go('/');
  };

  return (
    <>
      {snapshot.fatalError && (
        <div className="overlay overlay--fatal" role="alertdialog" aria-label="Disconnected">
          <div className="overlay__inner">
            <p className="eyebrow">Disconnected</p>
            <h2 className="display overlay__title">{snapshot.fatalError}</h2>
            <button className="btn btn--primary btn--lg" onClick={() => store.dismissFatal()}>
              Back to the start
            </button>
          </div>
        </div>
      )}

      {snapshot.screen === 'room' && snapshot.match && snapshot.you ? (
        <Room
          store={store}
          snapshot={snapshot}
          match={snapshot.match}
          youId={snapshot.you}
          camera={camera}
          onLeave={leave}
        />
      ) : snapshot.screen === 'room' ? (
        <main className="loading" role="status">
          <p className="eyebrow">Entering room {snapshot.roomCode}</p>
        </main>
      ) : (
        <Home
          store={store}
          invitedCode={route.code}
          joining={snapshot.joining}
          error={snapshot.joinError}
          offline={snapshot.status === 'offline'}
        />
      )}

      <Toasts toasts={snapshot.toasts} />
    </>
  );
}
