import { useEffect, useRef, useSyncExternalStore } from 'react';
import { MatchStore } from './net/store.js';
import { useCamera } from './media/useCamera.js';
import { sound } from './media/sound.js';
import { pagePath, roomPath, useRoute } from './hooks/useRoute.js';
import { useDocumentTitle } from './hooks/useDocumentTitle.js';
import { Toasts } from './components/Hud.jsx';
import { Nav } from './components/Nav.jsx';
import { Home } from './pages/Home.jsx';
import { Play } from './pages/Play.jsx';
import { Leaderboard } from './pages/Leaderboard.jsx';
import { Profile } from './pages/Profile.jsx';
import { Ranks } from './pages/Ranks.jsx';
import { Awards } from './pages/Awards.jsx';
import { Settings } from './pages/Settings.jsx';
import { Room } from './screens/Room.jsx';

export function App() {
  const storeRef = useRef<MatchStore | null>(null);
  storeRef.current ??= new MatchStore();
  const store = storeRef.current;

  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const camera = useCamera();
  const route = useRoute();
  useDocumentTitle(snapshot.match, snapshot.you);

  // Browsers refuse to start an audio context outside a gesture, and every cue
  // in the game fires from a state transition rather than a click. One listener
  // on the first interaction is what makes the rest of them audible.
  useEffect(() => {
    const unlock = () => sound.unlock();
    // `click` is the one activation event every input path produces — a mouse,
    // a tap, Enter on a focused button, or assistive tech driving the page.
    // The others just get there sooner.
    const events = ['pointerdown', 'keydown', 'click', 'touchend'] as const;
    const opts = { once: true, passive: true } as const;
    for (const name of events) window.addEventListener(name, unlock, opts);
    return () => {
      for (const name of events) window.removeEventListener(name, unlock);
    };
  }, []);

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
  // app is on a page would wipe /r/CODE on the very first render of a freshly
  // opened invite link, before the session has had a chance to resume. Leaving a
  // room navigates explicitly instead.
  useEffect(() => {
    if (snapshot.roomCode && snapshot.screen === 'room') route.go(roomPath(snapshot.roomCode));
  }, [snapshot.roomCode, snapshot.screen, route]);

  // Nothing should hold the camera open once the match is behind us.
  useEffect(() => {
    if (snapshot.screen !== 'home') return;
    if (camera.status === 'ready' || camera.status === 'requesting') camera.stop();
  }, [snapshot.screen, camera]);

  // The front page shows the top of the board. Asked for once, when the socket
  // comes up, rather than on every visit to the page.
  const askedForBoard = useRef(false);
  useEffect(() => {
    if (snapshot.status !== 'open' || askedForBoard.current) return;
    askedForBoard.current = true;
    store.requestBoard('rating');
  }, [snapshot.status, store]);

  const leave = () => {
    store.leave();
    camera.stop();
    resumedFor.current = null;
    route.go(pagePath('play'));
  };

  /**
   * Out of a finished room and straight back into a queue.
   *
   * The one thing a player must never hit at the end of a match is a dead end,
   * and an opponent who has closed their laptop turns the rematch button into
   * one. This leaves the seat, opens the search, and lands them on the page
   * that shows it.
   */
  const findAnother = () => {
    const name = snapshot.match?.players[snapshot.you ?? '']?.name ?? '';
    store.leave();
    camera.stop();
    resumedFor.current = null;
    route.go(pagePath('play'));
    if (name) store.findMatch(name);
  };

  const abandon = () => {
    store.dismissFatal();
    camera.stop();
    resumedFor.current = null;
    route.go(pagePath('home'));
  };

  const inRoom = snapshot.screen === 'room';
  // An invite link is a request to join, so it opens the page that can.
  const page = route.code && !inRoom ? 'play' : route.page;

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

      {inRoom && snapshot.match && snapshot.you ? (
        <Room
          store={store}
          snapshot={snapshot}
          match={snapshot.match}
          youId={snapshot.you}
          camera={camera}
          onLeave={leave}
          onFindAnother={findAnother}
        />
      ) : inRoom ? (
        <main className="loading" role="status">
          <p className="eyebrow">Entering room {snapshot.roomCode}</p>
        </main>
      ) : (
        <div className="shell">
          <Nav page={page} profile={snapshot.profile} onNavigate={route.go} />
          {page === 'play' ? (
            <Play
              store={store}
              invitedCode={route.code}
              joining={snapshot.joining}
              error={snapshot.joinError}
              offline={snapshot.status === 'offline'}
              queue={snapshot.queue}
              profile={snapshot.profile}
            />
          ) : page === 'leaderboard' ? (
            <Leaderboard
              store={store}
              board={snapshot.board}
              loading={snapshot.boardLoading}
              profile={snapshot.profile}
            />
          ) : page === 'profile' ? (
            <Profile profile={snapshot.profile} onNavigate={route.go} />
          ) : page === 'ranks' ? (
            <Ranks profile={snapshot.profile} />
          ) : page === 'awards' ? (
            <Awards profile={snapshot.profile} />
          ) : page === 'settings' ? (
            <Settings store={store} profile={snapshot.profile} camera={camera} />
          ) : (
            <Home
              profile={snapshot.profile}
              board={snapshot.board?.kind === 'rating' ? snapshot.board.entries : []}
              onNavigate={route.go}
            />
          )}
          <Footer onNavigate={route.go} />
        </div>
      )}

      <Toasts toasts={snapshot.toasts} />
    </>
  );
}

/** The one place Settings is linked from on a desktop, plus the honest small print. */
function Footer({ onNavigate }: { onNavigate: (path: string) => void }) {
  const go = (path: string) => (event: React.MouseEvent) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    onNavigate(path);
  };
  return (
    <footer className="foot">
      <span className="foot__note">
        No account, no database of you. Frames are kept for the round being scored and then dropped.
      </span>
      <a className="foot__link" href={pagePath('settings')} onClick={go(pagePath('settings'))}>
        Settings
      </a>
    </footer>
  );
}
