import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Home, Swords, Trophy, User, Users } from 'lucide-react';
import type { TelegramHome } from '@battle/shared';
import '../styles/telegram.css';
import { tr, useUiPreferences } from '../i18n/index.js';
import { setPreferences } from '../i18n/preferences.js';
import { MatchStore } from '../net/store.js';
import { useCamera } from '../media/useCamera.js';
import { Toasts } from '../components/Hud.jsx';
import { api, ApiError, setSessionToken } from './api.js';
import {
  announceReady,
  closeApp,
  haptics,
  launchContext,
  loadTelegramSdk,
  onBackButton,
  onTelegramEvent,
  type LaunchContext,
} from './sdk.js';
import { isTab, pathOf, tabFor, TABS, viewFrom, type Tab, type View } from './router.js';
import { Loading } from './ui.jsx';
import { HomeScreen } from './screens/Home.jsx';
import { ChallengeScreen, DuelScreen } from './screens/Duel.jsx';
import { RankScreen } from './screens/Rank.jsx';
import { PlayerScreen, SocialScreen } from './screens/Social.jsx';
import { AwardsScreen, MatchesScreen, MatchScreen, ProfileScreen } from './screens/Profile.jsx';
import { PremiumScreen, QuestsScreen, SettingsScreen } from './screens/More.jsx';

/**
 * Duel Battle inside Telegram.
 *
 * Its own React root, deliberately. The web app's shell is a landing page, a
 * nav bar, a footer and a router built for an address bar, none of which belong
 * in a Mini App — and forcing one component to be both would make every change
 * to either a risk to the other.
 *
 * What it does **not** duplicate is the game. When a duel starts this renders
 * the same `Room` the web app renders, driven by the same `MatchStore` over the
 * same socket. The arena, the prompts, the camera, the knockout: one
 * implementation, two ways in.
 */
const Room = lazy(() => import('../screens/Room.jsx').then((m) => ({ default: m.Room })));

/** How long the "opponent found" card holds before the arena takes over. */
const FOUND_MS = 2_600;

type Boot =
  | { phase: 'loading' }
  | { phase: 'outside' }
  | { phase: 'failed'; message: string }
  | { phase: 'ready'; home: TelegramHome };

export function TelegramApp() {
  useUiPreferences();
  const storeRef = useRef<MatchStore | null>(null);
  storeRef.current ??= new MatchStore();
  const store = storeRef.current;
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const camera = useCamera();

  const [boot, setBoot] = useState<Boot>({ phase: 'loading' });
  const [launch, setLaunch] = useState<LaunchContext | null>(null);
  const [view, setView] = useState<View>(() => viewFrom(location.pathname));
  const [stack, setStack] = useState<View[]>([]);
  const [foundAt, setFoundAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(0);

  // -- Boot ----------------------------------------------------------------

  const authenticate = useCallback(async () => {
    setBoot({ phase: 'loading' });
    const available = await loadTelegramSdk();
    const context = launchContext();
    setLaunch(context);

    if (!available || !context.inTelegram) {
      setBoot({ phase: 'outside' });
      return;
    }
    try {
      const result = await api.authenticate(context.initData);
      setSessionToken(result.token);
      store.setAuthToken(result.token);
      setBoot({ phase: 'ready', home: result.home });

      // The deep link the app was opened with decides the first screen. A
      // challenge is pushed with home underneath it, so the back button leads
      // into the game rather than out of the app.
      if (result.intent.kind === 'challenge') {
        setStack([{ k: 'home' }]);
        setView({ k: 'challenge', code: result.intent.code });
      } else if (result.intent.kind === 'section') {
        setStack([]);
        setView({ k: result.intent.section });
      } else if (result.intent.kind === 'referral' && result.intent.accepted) {
        haptics.result('success');
      }
    } catch (failure) {
      setBoot({
        phase: 'failed',
        message:
          failure instanceof ApiError ? failure.message : tr('We could not open your player.'),
      });
    }
  }, [store]);

  useEffect(() => {
    void authenticate();
  }, [authenticate]);

  useEffect(() => {
    store.start();
    return () => store.stop();
  }, [store]);

  // Telegram's palette is the player's choice for their chat, not for a game
  // that is mostly a camera feed. What is taken from it is the chrome colour,
  // so the app does not sit in a differently coloured frame.
  useEffect(() => {
    if (boot.phase === 'loading') return;
    announceReady('#13170e');
  }, [boot.phase]);

  /**
   * Safe areas, which move.
   *
   * Telegram changes them when the app is expanded, when the keyboard opens and
   * when a phone is rotated, and it announces each of those separately — so the
   * insets are re-read on every one rather than trusted from the launch.
   */
  const ready = boot.phase !== 'loading';
  useEffect(() => {
    if (!ready) return;
    const apply = () => setLaunch(launchContext());
    apply();
    const off = [
      onTelegramEvent('safeAreaChanged', apply),
      onTelegramEvent('contentSafeAreaChanged', apply),
      onTelegramEvent('viewportChanged', apply),
    ];
    return () => {
      for (const unsubscribe of off) unsubscribe();
    };
  }, [ready]);

  // Telegram tells the Mini App which language the player's client is in. It is
  // a default, applied once, and only when the player has not chosen for
  // themselves — a manual choice must survive every launch.
  const inTelegram = launch?.inTelegram ?? false;
  useEffect(() => {
    if (!inTelegram) return;
    try {
      if (localStorage.getItem('battle.preferences.v1')) return;
    } catch {
      /* Storage is optional; fall through and set the language for this launch. */
    }
    if (navigator.language.toLowerCase().startsWith('ru')) setPreferences({ language: 'ru' });
  }, [inTelegram]);

  // -- Navigation ----------------------------------------------------------

  const syncPath = useCallback((next: View) => {
    const path = pathOf(next);
    if (location.pathname !== path) history.pushState(null, '', path);
  }, []);

  const push = useCallback(
    (next: View) => {
      haptics.tap();
      setStack((current) => [...current, view]);
      setView(next);
      syncPath(next);
    },
    [view, syncPath],
  );

  const back = useCallback(() => {
    setStack((current) => {
      if (current.length === 0) return current;
      const previous = current[current.length - 1]!;
      setView(previous);
      syncPath(previous);
      return current.slice(0, -1);
    });
  }, [syncPath]);

  const openTab = useCallback(
    (tab: Tab) => {
      haptics.select();
      setStack([]);
      setView({ k: tab });
      syncPath({ k: tab });
    },
    [syncPath],
  );

  const go = useCallback(
    (next: View) => (isTab(next) ? openTab(next.k) : push(next)),
    [openTab, push],
  );

  /**
   * Telegram's back button, and the browser's.
   *
   * Both are wired to the same stack so a Mini App on desktop — where the
   * browser's back gesture still exists — cannot walk out of the app while the
   * in-app stack thinks it is three screens deep.
   */
  useEffect(() => {
    const canGoBack = stack.length > 0;
    const off = onBackButton(canGoBack ? back : null);
    const onPop = () => {
      if (stack.length > 0) back();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      off();
      window.removeEventListener('popstate', onPop);
    };
  }, [stack.length, back]);

  // -- Live data -----------------------------------------------------------

  const refresh = useCallback(() => {
    api
      .home()
      .then((home) => setBoot({ phase: 'ready', home }))
      .catch(() => {
        /* A background refresh that fails leaves the last good screen up. */
      });
  }, []);

  // Coming back from a match is the moment the numbers on screen are stale.
  const wasInRoom = useRef(false);
  useEffect(() => {
    const inRoom = snapshot.screen === 'room';
    if (wasInRoom.current && !inRoom) refresh();
    wasInRoom.current = inRoom;
  }, [snapshot.screen, refresh]);

  // -- Matchmaking ---------------------------------------------------------

  const find = useCallback(() => {
    if (boot.phase !== 'ready') return;
    openTab('duel');
    store.findMatch(boot.home.me.name || 'Player', 'ranked');
  }, [boot, store, openTab]);

  const enterRoom = useCallback(
    (roomCode: string) => {
      if (boot.phase !== 'ready') return;
      store.joinRoom(roomCode, boot.home.me.name || 'Player');
    },
    [boot, store],
  );

  // The "opponent found" beat: seated, but not yet in the arena.
  useEffect(() => {
    if (snapshot.screen !== 'room') {
      setFoundAt(null);
      return;
    }
    if (foundAt !== null) return;
    setFoundAt(Date.now());
    haptics.result('success');
  }, [snapshot.screen, foundAt]);

  useEffect(() => {
    if (foundAt === null) return;
    const timer = window.setTimeout(() => setNowTick((value) => value + 1), FOUND_MS);
    return () => window.clearTimeout(timer);
  }, [foundAt]);

  const showingFound =
    foundAt !== null &&
    snapshot.match?.phase === 'lobby' &&
    Date.now() - foundAt < FOUND_MS &&
    nowTick >= 0;

  // -- Render --------------------------------------------------------------

  if (boot.phase === 'loading') {
    return (
      <div className="tg-boot">
        <div className="tg-boot__inner">
          <span className="tg-spinner" aria-hidden />
          <p>{tr('Opening Duel Battle…')}</p>
        </div>
      </div>
    );
  }

  if (boot.phase === 'outside') {
    return (
      <div className="tg-boot">
        <div className="tg-boot__inner">
          <h1>
            <Swords size={22} aria-hidden /> {tr('Duel Battle')}
          </h1>
          <p>
            {tr(
              'This screen is the Telegram version of the game. Open it from the bot and it signs you in automatically.',
            )}
          </p>
          <a className="btn btn--primary btn--block" href="/play">
            {tr('Play in the browser instead')}
          </a>
          {/*
            Telegram's SDK is fetched from telegram.org, so a slow or blocked
            request lands here too — which looks identical to "you are in a
            browser" and is not. One retry costs nothing and saves the player
            who is genuinely inside Telegram on a bad connection.
          */}
          <button
            type="button"
            className="btn btn--ghost btn--block"
            onClick={() => void authenticate()}
          >
            {tr('Try again')}
          </button>
        </div>
      </div>
    );
  }

  if (boot.phase === 'failed') {
    return (
      <div className="tg-boot">
        <div className="tg-boot__inner">
          <h1>{tr('That did not open')}</h1>
          <p>{boot.message}</p>
          <button type="button" className="btn btn--primary btn--block" onClick={() => void authenticate()}>
            {tr('Try again')}
          </button>
          <button type="button" className="btn btn--ghost btn--block" onClick={closeApp}>
            {tr('Close')}
          </button>
        </div>
      </div>
    );
  }

  const { home } = boot;

  if (snapshot.screen === 'room' && snapshot.match && snapshot.you) {
    if (showingFound) {
      const opponentId = snapshot.match.seats.find((seat) => seat && seat !== snapshot.you);
      const opponent = opponentId ? snapshot.match.players[opponentId] : null;
      return (
        <div className="tg-boot">
          <div className="tg-boot__inner">
            <p className="eyebrow">{tr('Opponent found')}</p>
            <div className="tg-versus">
              <span className="tg-versus__side">
                <strong>{home.me.name}</strong>
                <span>{home.me.rank.label}</span>
              </span>
              <span className="tg-versus__vs">{tr('VS')}</span>
              <span className="tg-versus__side">
                <strong>{opponent?.name ?? tr('Opponent')}</strong>
                <span>{tr('ready')}</span>
              </span>
            </div>
            <span className="tg-spinner" aria-hidden />
            <p>{tr('Getting the arena ready. You will need your camera.')}</p>
          </div>
        </div>
      );
    }
    return (
      <Suspense fallback={<Loading label="Entering the arena…" />}>
        <Room
          store={store}
          snapshot={snapshot}
          match={snapshot.match}
          youId={snapshot.you}
          camera={camera}
          onLeave={() => {
            store.leave();
            camera.stop();
            refresh();
            openTab('home');
          }}
          onFindAnother={() => {
            store.leave();
            camera.stop();
            refresh();
            find();
          }}
        />
        <Toasts toasts={snapshot.toasts} />
      </Suspense>
    );
  }

  const tab = tabFor(view);

  return (
    <div className="tg">
      <div
        className={`tg__body ${view.k === 'duel' ? 'tg__body--tall' : ''}`}
        style={{
          '--tg-top': `${launch?.safeArea.top ?? 0}px`,
          '--tg-bottom': `${launch?.safeArea.bottom ?? 0}px`,
        } as React.CSSProperties}
        key={`${view.k}-${'index' in view ? view.index : 'ref' in view ? view.ref : 'code' in view ? view.code : ''}`}
      >
        {view.k === 'home' && <HomeScreen home={home} onGo={go} onPlay={find} />}
        {view.k === 'duel' && (
          <DuelScreen
            home={home}
            queue={snapshot.queue}
            offline={snapshot.status !== 'open'}
            onFind={find}
            onCancel={() => store.cancelFind()}
            onGo={go}
            onRefresh={refresh}
          />
        )}
        {view.k === 'rank' && <RankScreen onGo={go} />}
        {view.k === 'social' && <SocialScreen me={home.me} onGo={go} />}
        {view.k === 'profile' && (
          <ProfileScreen me={home.me} matches={home.recentMatches} onGo={go} />
        )}
        {view.k === 'quests' && <QuestsScreen onClaimed={refresh} />}
        {view.k === 'awards' && <AwardsScreen />}
        {view.k === 'matches' && <MatchesScreen onGo={go} />}
        {view.k === 'match' && <MatchScreen index={view.index} />}
        {view.k === 'player' && <PlayerScreen playerRef={view.ref} onBack={back} />}
        {view.k === 'challenge' && (
          <ChallengeScreen code={view.code} onEnterRoom={enterRoom} onBack={back} />
        )}
        {view.k === 'premium' && <PremiumScreen onRefresh={refresh} />}
        {view.k === 'settings' && <SettingsScreen me={home.me} onSaved={refresh} />}
      </div>

      <nav className="tg__nav" aria-label={tr('Sections')}>
        {TABS.map((id) => {
          const Icon = { home: Home, duel: Swords, rank: Trophy, social: Users, profile: User }[id];
          const label = { home: 'Home', duel: 'Duel', rank: 'Rank', social: 'Friends', profile: 'You' }[
            id
          ];
          const badge =
            (id === 'social' && home.incoming.length > 0) ||
            (id === 'duel' &&
              home.quests.quests.some((quest) => quest.done && !quest.claimed));
          return (
            <button
              key={id}
              type="button"
              className={tab === id ? 'is-active' : ''}
              aria-current={tab === id ? 'page' : undefined}
              onClick={() => openTab(id)}
            >
              <span>
                <Icon size={20} aria-hidden />
                {badge && <span className="tg-dot" aria-hidden />}
              </span>
              {tr(label)}
            </button>
          );
        })}
      </nav>

      <Toasts toasts={snapshot.toasts} />
    </div>
  );
}
