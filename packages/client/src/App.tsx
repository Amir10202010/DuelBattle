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
    // Deliberately no teardown. The store's lifetime is the page's, and closing
    // the socket on unmount makes React's development double-mount look like a
    // dropped connection — which replays the join intent and opens a second,
    // orphaned room. The browser closes the socket on unload.
  }, [store]);

  // Arriving on a /r/CODE link with a session for that room walks straight back in.
  const resumedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!route.code || snapshot.status !== 'open' || snapshot.screen === 'room') return;
    if (resumedFor.current === route.code) return;
    resumedFor.current = route.code;
    store.resumeSession(route.code);
  }, [route.code, snapshot.status, snapshot.screen, store]);

  // Once seated, the address bar shows the shareable room link.
  //
  // It deliberately only ever moves *into* a room. Clearing the URL whenever the
  // app is on the home screen would wipe /r/CODE on the very first render of a
  // freshly opened invite link, before the session has had a chance to resume.
  // Leaving a room navigates explicitly instead.
  useEffect(() => {
    if (snapshot.roomCode && snapshot.screen === 'room') route.go(roomPath(snapshot.roomCode));
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

  const abandon = () => {
    store.dismissFatal();
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
            <button className="btn btn--primary btn--lg" onClick={abandon}>
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
