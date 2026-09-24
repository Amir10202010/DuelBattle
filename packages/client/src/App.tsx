import { useInterfaceSound } from './hooks/useInterfaceSound.js';
import { useMusic } from './hooks/useMusic.js';
import { tr, useUiPreferences } from './i18n/index.js';
import { lazy, Suspense, useEffect, useRef, useSyncExternalStore } from 'react';
import { MatchStore } from './net/store.js';
import { useCamera } from './media/useCamera.js';
import { roomPath, useRoute } from './hooks/useRoute.js';
import { useDocumentTitle } from './hooks/useDocumentTitle.js';
import { authRequest, useAuth, type AuthState } from './hooks/useAuth.js';
import { Toasts } from './components/Hud.jsx';
import { Nav } from './components/Nav.jsx';
import { AuthGate, ErrorState, Skeleton } from './components/PageState.jsx';
import { Landing } from './pages/Landing.jsx';
import { Home } from './pages/Home.jsx';
import { Onboarding } from './pages/Auth.jsx';
import { Auth } from './pages/SignIn.jsx';
import { EconomyProvider } from './hooks/useEconomy.jsx';
import { MetaProvider } from './hooks/useMeta.jsx';
import { EconomyFeedback } from './components/currency/Coins.jsx';
import { RewardReveal } from './components/meta/RewardReveal.jsx';
import { startAnalytics, track } from './analytics.js';
const Play = lazy(() => import('./pages/Play.jsx').then((m) => ({ default: m.Play })));
const Leaderboard = lazy(() =>
  import('./pages/Leaderboard.jsx').then((m) => ({ default: m.Leaderboard })),
);
const Profile = lazy(() => import('./pages/Profile.jsx').then((m) => ({ default: m.Profile })));
const Ranks = lazy(() => import('./pages/Ranks.jsx').then((m) => ({ default: m.Ranks })));
const Awards = lazy(() => import('./pages/Awards.jsx').then((m) => ({ default: m.Awards })));
const Settings = lazy(() => import('./pages/Settings.jsx').then((m) => ({ default: m.Settings })));
const Store = lazy(() => import('./pages/Store.jsx').then((m) => ({ default: m.Store })));
const Room = lazy(() => import('./screens/Room.jsx').then((m) => ({ default: m.Room })));
const Pass = lazy(() => import('./pages/Pass.jsx').then((m) => ({ default: m.Pass })));
const Admin = lazy(() => import('./pages/Admin.jsx').then((m) => ({ default: m.Admin })));

export function App() {
  const preferences = useUiPreferences();
  const storeRef = useRef<MatchStore | null>(null);
  storeRef.current ??= new MatchStore();
  const store = storeRef.current;
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const auth = useAuth();
  const camera = useCamera();
  const route = useRoute();
  const inGame = snapshot.screen === 'room' || !['home', 'login', 'register', 'recover'].includes(route.page);
  useMusic(snapshot.screen === 'room' ? snapshot.match : null, store, inGame);
  useInterfaceSound(inGame);
  useDocumentTitle(snapshot.match, snapshot.you);
  const profile = auth.account ? (snapshot.profile ?? auth.profile) : null;
  useEffect(() => {
    store.start();
    const stopAnalytics = startAnalytics();
    return () => { stopAnalytics(); store.stop(); };
  }, [store]);
  useEffect(() => {
    track('screen_view', { screen: snapshot.screen === 'room' ? 'room' : route.page });
  }, [route.page, snapshot.screen]);
  const resumedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!route.code || snapshot.status !== 'open' || snapshot.screen === 'room') return;
    if (resumedFor.current === route.code) return;
    resumedFor.current = route.code;
    store.resumeSession(route.code);
  }, [route.code, snapshot.status, snapshot.screen, store]);
  useEffect(() => {
    if (snapshot.roomCode && snapshot.screen === 'room') route.go(roomPath(snapshot.roomCode));
  }, [snapshot.roomCode, snapshot.screen, route]);
  useEffect(() => {
    if (snapshot.screen === 'home' && (camera.status === 'ready' || camera.status === 'requesting'))
      camera.stop();
  }, [snapshot.screen, camera]);
  useEffect(() => {
    if (auth.account && snapshot.status === 'open' && route.page === 'dashboard')
      store.requestBoard('rating');
  }, [auth.account, snapshot.status, route.page, store]);
  useEffect(() => {
    if (
      !auth.loading &&
      auth.account &&
      !auth.account.onboarded &&
      route.page !== 'onboarding' &&
      snapshot.screen !== 'room'
    )
      route.go('/onboarding');
  }, [auth.account, auth.loading, route, snapshot.screen]);
  useEffect(() => {
    if (snapshot.screen === 'room') return;
    const heading = document.querySelector('main h1');
    if (heading instanceof HTMLElement) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  }, [route.page, snapshot.screen]);
  useEffect(() => {
    store.setLanguage(preferences.locale);
  }, [preferences.locale, store]);
  const completedAuth = (state: AuthState) => {
    auth.setState(state);
    store.refreshAccount(state.profile);
    route.go(state.account?.onboarded ? '/home' : '/onboarding');
  };
  const leave = () => {
    store.leave();
    camera.stop();
    resumedFor.current = null;
    route.go(auth.account ? '/home' : '/play');
  };
  const findAnother = () => {
    const name = snapshot.match?.players[snapshot.you ?? '']?.name ?? profile?.name ?? '';
    store.leave();
    camera.stop();
    resumedFor.current = null;
    route.go('/play');
    if (name) store.findMatch(name, auth.account && snapshot.match?.ranked ? 'ranked' : 'casual');
  };
  const abandon = () => {
    store.dismissFatal();
    camera.stop();
    resumedFor.current = null;
    void auth.refresh();
    route.go('/play');
  };
  const logout = async () => {
    await authRequest('logout', {});
    auth.setState({ account: null, profile: null });
    store.refreshAccount(null);
    route.go('/');
  };
  const inRoom = snapshot.screen === 'room';
  const page = route.code && !inRoom ? 'play' : route.page;
  const publicOnly = ['home', 'login', 'register', 'recover', 'onboarding'].includes(page);
  const protectedPage = [
    'store',
    'dashboard',
    'leaderboard',
    'profile',
    'ranks',
    'awards',
    'onboarding',
    'pass',
    'admin',
  ].includes(page);
  const gateName = {
    store: 'the store',
    dashboard: 'your game home',
    leaderboard: 'the ladder',
    profile: 'your locker',
    ranks: 'the rank ladder',
    awards: 'your rewards',
    onboarding: 'your player',
    pass: 'the season pass',
    admin: 'the dashboard',
  }[page as 'dashboard'];
  let content;
  if (page === 'home') content = <Landing onNavigate={route.go} />;
  else if (auth.loading) content = <Skeleton />;
  else if (auth.error)
    content = <ErrorState message={auth.error} onRetry={() => void auth.refresh()} />;
  else if (protectedPage && !auth.account)
    content = <AuthGate feature={gateName} onNavigate={route.go} />;
  else if (page === 'login' || page === 'register' || page === 'recover')
    content = <Auth key={page} mode={page} onSuccess={completedAuth} onNavigate={route.go} />;
  else if (page === 'onboarding') content = <Onboarding onDone={completedAuth} />;
  else if (page === 'play')
    content = (
      <Play
        store={store}
        invitedCode={route.code}
        joining={snapshot.joining}
        error={snapshot.joinError}
        offline={snapshot.status !== 'open'}
        queue={snapshot.queue}
        profile={profile}
      />
    );
  else if (page === 'leaderboard')
    content = (
      <Leaderboard
        store={store}
        board={snapshot.board}
        loading={snapshot.boardLoading}
        profile={profile}
        error={snapshot.boardError ?? null}
      />
    );
  else if (page === 'profile')
    content = <Profile profile={profile} store={store} onNavigate={route.go} />;
  else if (page === 'ranks') content = <Ranks profile={profile} />;
  else if (page === 'awards') content = <Awards profile={profile} />;
  else if (page === 'store') content = <Store />;
  else if (page === 'pass') content = <Pass />;
  else if (page === 'admin') content = <Admin />;
  else if (page === 'settings')
    content = (
      <Settings
        store={store}
        profile={profile}
        camera={camera}
        onLogout={logout}
        onNavigate={route.go}
      />
    );
  else
    content = profile ? (
      <Home
        profile={profile}
        board={snapshot.board}
        store={store}
        offline={snapshot.status !== 'open'}
        onNavigate={route.go}
      />
    ) : (
      <Skeleton />
    );
  return (
    <EconomyProvider accountKey={auth.account?.username ?? null} revision={`${profile?.xp}:${route.page}:${snapshot.match?.phase === 'matchResult'}`}>
      <MetaProvider accountKey={auth.account?.username ?? null} revision={`${profile?.xp}:${route.page}:${snapshot.match?.phase === 'matchResult'}`}>
      <EconomyFeedback />
      <RewardReveal />
      <a className="skip-link" href="#main-content">
        {tr('Skip to content')}
      </a>
      {snapshot.fatalError && (
        <div
          className="overlay overlay--fatal"
          role="alertdialog"
          aria-modal="true"
          aria-label={tr('Connection interrupted')}
        >
          <div className="overlay__inner">
            <p className="eyebrow">{tr('Connection interrupted')}</p>
            <h2>{tr(snapshot.fatalError)}</h2>
            <button autoFocus className="btn btn--primary" onClick={abandon}>
              {tr('Back to the arena')}
            </button>
          </div>
        </div>
      )}
      <Suspense
        fallback={
          <div
            className={`shell ${publicOnly ? 'shell--public' : 'shell--game'} ${page === 'home' ? 'shell--landing' : ''}`}
          >
            <Nav page={page} profile={profile} onNavigate={route.go} publicOnly={publicOnly} pinned={page === 'onboarding'} />
            <Skeleton />
          </div>
        }
      >
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
          <Skeleton label="Entering your room" />
        ) : (
          <div
            className={`shell ${publicOnly ? 'shell--public' : 'shell--game'} ${page === 'home' ? 'shell--landing' : ''}`}
          >
            <Nav page={page} profile={profile} onNavigate={route.go} publicOnly={publicOnly} pinned={page === 'onboarding'} />
            <div id="main-content" className="screen-content" key={page}>
              {content}
            </div>
            {page !== 'home' && (
              <footer className="foot">
                <span>{tr('Your room is the game.')}</span>
                <span>{tr('Camera only. No microphone. Play fair.')}</span>
                <a
                  href="/settings"
                  onClick={(e) => {
                    e.preventDefault();
                    route.go('/settings');
                  }}
                >
                  {tr('Settings & privacy')}
                </a>
              </footer>
            )}
          </div>
        )}
      </Suspense>
      <Toasts toasts={snapshot.toasts} />
      </MetaProvider>
    </EconomyProvider>
  );
}
