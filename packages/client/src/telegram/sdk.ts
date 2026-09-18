/**
 * Telegram's Mini App SDK, wrapped so the rest of the app never touches it.
 *
 * Three reasons for the wrapper. The SDK is a global that may not be there —
 * in a browser, in a test, in a Telegram client too old for the method being
 * called — and every call site guarding for that itself is how a Mini App
 * becomes undebuggable. Its API is untyped. And `initDataUnsafe` sits right
 * next to `initData` with a name that stops being a warning after the second
 * reading, so nothing outside this file is allowed to see it at all.
 *
 * Everything here is a no-op when Telegram is absent, which is what lets the
 * Mini App be developed in an ordinary browser tab.
 */

/** The official script. Pinned to a version, as Telegram's own docs do. */
const SDK_URL = 'https://telegram.org/js/telegram-web-app.js?63';

export type HapticStyle = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';
export type HapticNotification = 'error' | 'success' | 'warning';

interface WebAppButton {
  show(): void;
  hide(): void;
  onClick(handler: () => void): void;
  offClick(handler: () => void): void;
}

interface SafeAreaInset {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface WebApp {
  initData: string;
  initDataUnsafe?: { start_param?: string };
  version: string;
  platform: string;
  colorScheme: 'light' | 'dark';
  themeParams: Record<string, string>;
  viewportStableHeight?: number;
  safeAreaInset?: SafeAreaInset;
  contentSafeAreaInset?: SafeAreaInset;
  isExpanded?: boolean;
  BackButton: WebAppButton;
  MainButton: WebAppButton & { setText(text: string): void };
  HapticFeedback?: {
    impactOccurred(style: HapticStyle): void;
    notificationOccurred(type: HapticNotification): void;
    selectionChanged(): void;
  };
  ready(): void;
  expand(): void;
  close(): void;
  isVersionAtLeast(version: string): boolean;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  disableVerticalSwipes?(): void;
  enableClosingConfirmation?(): void;
  disableClosingConfirmation?(): void;
  openLink(url: string, options?: { try_instant_view?: boolean }): void;
  openTelegramLink(url: string): void;
  openInvoice(url: string, callback?: (status: string) => void): void;
  onEvent(event: string, handler: () => void): void;
  offEvent(event: string, handler: () => void): void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: WebApp };
  }
}

function app(): WebApp | null {
  return typeof window === 'undefined' ? null : (window.Telegram?.WebApp ?? null);
}

/**
 * Loads the SDK, once.
 *
 * Injected rather than written into `index.html`, because there is one document
 * for the whole product and the ordinary web app has no business fetching a
 * script from another origin. The Content-Security-Policy only permits
 * telegram.org on the Mini App's own routes, which is exactly where this runs.
 */
let loading: Promise<boolean> | null = null;
export function loadTelegramSdk(): Promise<boolean> {
  if (app()) return Promise.resolve(true);
  loading ??= new Promise<boolean>((resolve) => {
    if (typeof document === 'undefined') {
      resolve(false);
      return;
    }
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    script.onload = () => resolve(Boolean(app()));
    // A browser with no Telegram, or a blocked request. The Mini App says so
    // rather than hanging on a spinner forever.
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
  return loading;
}

export interface LaunchContext {
  /** True only inside a real Telegram client. */
  inTelegram: boolean;
  /** The raw signed payload. The only thing the server will accept. */
  initData: string;
  /** `ios`, `android`, `tdesktop`, `weba`… Useful for one or two quirks. */
  platform: string;
  colorScheme: 'light' | 'dark';
  /** The `startapp=` payload, for showing the right screen before the server replies. */
  startParam: string | null;
  safeArea: SafeAreaInset;
}

export function launchContext(): LaunchContext {
  const webApp = app();
  const content = webApp?.contentSafeAreaInset;
  const device = webApp?.safeAreaInset;
  const merge = (key: keyof SafeAreaInset) =>
    Math.max(0, Number(device?.[key] ?? 0)) + Math.max(0, Number(content?.[key] ?? 0));
  return {
    inTelegram: Boolean(webApp?.initData),
    initData: webApp?.initData ?? '',
    platform: webApp?.platform ?? 'unknown',
    colorScheme: webApp?.colorScheme ?? 'dark',
    startParam: webApp?.initDataUnsafe?.start_param ?? null,
    safeArea: {
      top: merge('top'),
      bottom: merge('bottom'),
      left: merge('left'),
      right: merge('right'),
    },
  };
}

/**
 * Tells Telegram the app is up, and asks for the whole sheet.
 *
 * `expand()` matters more than it looks: a Mini App opens at half height, and a
 * game that starts with its first button below the fold reads as broken before
 * anybody has pressed anything.
 */
export function announceReady(background: string): void {
  const webApp = app();
  if (!webApp) return;
  webApp.ready();
  webApp.expand();
  try {
    webApp.setHeaderColor(background);
    webApp.setBackgroundColor(background);
  } catch {
    /* Older clients reject a colour they do not know. Not worth failing over. */
  }
  // A swipe-down that closes the app in the middle of a duel is a lost match.
  if (webApp.isVersionAtLeast('7.7')) webApp.disableVerticalSwipes?.();
}

/** Subscribes to Telegram's own back button. Returns an unsubscribe. */
export function onBackButton(handler: (() => void) | null): () => void {
  const webApp = app();
  if (!webApp) return () => {};
  if (!handler) {
    webApp.BackButton.hide();
    return () => {};
  }
  webApp.BackButton.onClick(handler);
  webApp.BackButton.show();
  return () => {
    webApp.BackButton.offClick(handler);
    webApp.BackButton.hide();
  };
}

/** Subscribes to a Telegram event, e.g. `themeChanged` or `viewportChanged`. */
export function onTelegramEvent(event: string, handler: () => void): () => void {
  const webApp = app();
  if (!webApp) return () => {};
  webApp.onEvent(event, handler);
  return () => webApp.offEvent(event, handler);
}

export const haptics = {
  tap(style: HapticStyle = 'light'): void {
    app()?.HapticFeedback?.impactOccurred(style);
  },
  result(type: HapticNotification): void {
    app()?.HapticFeedback?.notificationOccurred(type);
  },
  select(): void {
    app()?.HapticFeedback?.selectionChanged();
  },
};

/**
 * Opens a link the way Telegram wants it opened.
 *
 * A t.me link has to go through `openTelegramLink` or it bounces the player out
 * to a browser and back; everything else goes through `openLink`. Outside
 * Telegram both fall back to an ordinary navigation.
 */
export function openLink(url: string): void {
  const webApp = app();
  const telegram = /^https:\/\/t\.me\//.test(url);
  if (!webApp) {
    window.open(url, '_blank', 'noopener');
    return;
  }
  if (telegram) webApp.openTelegramLink(url);
  else webApp.openLink(url);
}

/**
 * Shares something through Telegram's own picker.
 *
 * `t.me/share/url` is the one sharing mechanism every client supports, and
 * opening it with `openTelegramLink` keeps the player inside Telegram — which
 * is the entire difference between "share" and "copy this link".
 */
export function shareLink(url: string, text: string): void {
  openLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`);
}

/** Opens a Stars invoice. Resolves with Telegram's own status string. */
export function openInvoice(url: string): Promise<string> {
  const webApp = app();
  if (!webApp) return Promise.resolve('unsupported');
  return new Promise((resolve) => {
    try {
      webApp.openInvoice(url, (status) => resolve(status));
    } catch {
      resolve('failed');
    }
  });
}

export function closeApp(): void {
  app()?.close();
}

/** Whether the client is new enough for a feature, without throwing if it is not. */
export function supports(version: string): boolean {
  try {
    return app()?.isVersionAtLeast(version) ?? false;
  } catch {
    return false;
  }
}
