// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  DAILY_CALENDAR,
  DEFAULT_LOADOUT,
  OFFERS,
  STARTER_QUESTS,
  dailyBoard,
  dailyDeals,
  dayKey,
  seasonAt,
  weeklyBoard,
  type MetaView,
  type QuestDefinition,
} from '@battle/shared';
import { EconomyProvider } from '../src/hooks/useEconomy.js';
import { MetaProvider, useMeta } from '../src/hooks/useMeta.js';
import { QuestBoard } from '../src/components/meta/QuestBoard.js';
import { DailyCalendar } from '../src/components/meta/DailyCalendar.js';
import { SeasonCard } from '../src/components/meta/SeasonCard.js';
import { OfferCard } from '../src/components/meta/OfferCard.js';
import { RewardReveal } from '../src/components/meta/RewardReveal.js';
import { Store } from '../src/pages/Store.js';
import { Pass } from '../src/pages/Pass.js';
import { setPreferences } from '../src/i18n/preferences.js';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NOW = Date.UTC(2026, 8, 23, 12);
const cleanups: Array<() => void> = [];
const calls: { path: string; body: unknown }[] = [];
let view: MetaView;
let answer: (path: string, body: unknown) => unknown = () => ({});

const quest = (definition: QuestDefinition, progress: number, claimed = false) => ({
  id: definition.id,
  period: definition.period,
  title: definition.title,
  description: definition.description,
  progress,
  target: definition.target,
  rewards: definition.rewards,
  done: progress >= definition.target,
  claimed,
});

function fixture(): MetaView {
  const season = seasonAt(NOW);
  return {
    wallet: { coins: 500, gems: 40 },
    quests: {
      daily: dailyBoard(dayKey(NOW)).map((q) => quest(q, 0)),
      weekly: weeklyBoard('2026-W39').map((q) => quest(q, 1)),
      starter: STARTER_QUESTS.map((q, i) => quest(q, i === 0 ? 1 : 0)),
      dailyResetsAt: NOW + 3_600_000,
      weeklyResetsAt: NOW + 86_400_000,
    },
    season: {
      id: season.id, number: season.number, name: season.name, tagline: season.tagline, accent: season.accent,
      startsAt: season.startsAt, endsAt: season.endsAt, points: 1100, tier: 2, into: 100, cost: 500, maxed: false,
      premium: false, premiumViaMembership: false, passPrice: 600, plusPrice: 1000, plusTiers: 10,
      tiers: season.tiers.map((t) => ({ ...t, reached: t.tier <= 2, freeClaimed: t.tier === 1, premiumClaimed: false })),
    },
    calendar: { index: 2, claimedToday: false, claims: 2, resetsAt: NOW + 3_600_000, days: DAILY_CALENDAR },
    store: {
      offers: OFFERS.map((offer) => ({
        id: offer.id, kind: offer.kind, name: offer.name, description: offer.description, price: offer.price,
        rewards: offer.rewards, ...(offer.badge ? { badge: offer.badge } : {}), accent: offer.accent, purchased: false,
        endsAt: offer.windowDays ? NOW + offer.windowDays * 86_400_000 : null,
      })),
      deals: dailyDeals(dayKey(NOW)).map((deal) => ({ ...deal, owned: false })),
      dealsResetAt: NOW + 3_600_000,
      payments: { card: false, stars: false },
    },
    claimable: 3,
    admin: false,
    serverTime: NOW,
  };
}

beforeEach(() => {
  // jsdom has the element but not the modal behaviour; open is all a test reads.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
  setPreferences({ language: 'en' });
  view = fixture();
  calls.length = 0;
  answer = () => ({});
  // Reduced motion: the reveal skips straight to its last frame, which is what a test can read.
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.stubGlobal('fetch', vi.fn(async (path: string, init?: { body?: string }) => {
    const body = init?.body ? JSON.parse(init.body) : undefined;
    calls.push({ path, body });
    const payload =
      path === '/api/meta' ? view
      : path === '/api/economy' ? { coins: view.wallet.coins, gems: view.wallet.gems, owned: ['cloud'], loadout: DEFAULT_LOADOUT, level: 1, dailyClaimed: false }
      : answer(path, body);
    return { ok: true, status: 200, json: async () => payload } as Response;
  }));
});
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function render(content: ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <EconomyProvider accountKey="tester" revision="1">
        <MetaProvider accountKey="tester" revision="1">
          {content}
          <RewardReveal />
        </MetaProvider>
      </EconomyProvider>,
    );
  });
  // Let the lobby fetch land.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  cleanups.push(() => {
    act(() => root.unmount());
    container.remove();
  });
  return container;
}

const button = (container: HTMLElement, text: string) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent?.replace(/\s+/g, ' ').trim() === text);

let state: ReturnType<typeof useMeta>;
function Probe() { state = useMeta(); return null; }
const response = (payload: unknown, status = 200) => ({ ok: status < 400, status, json: async () => payload }) as Response;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('lobby request lifetimes', () => {
  it('locks a mutation synchronously against two taps in the same render', async () => {
    await render(<Probe />);
    answer = () => ({ granted: [], view });
    await act(async () => { await Promise.all([state.buy('coins_1200'), state.buy('coins_1200')]); });
    expect(calls.filter((call) => call.path === '/api/meta/buy')).toHaveLength(1);
  });

  it('does not overwrite a successful claim with an older read', async () => {
    await render(<Probe />);
    const old = deferred<Response>();
    const normal = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementationOnce(() => old.promise);
    act(() => state.refresh());
    const newer = { ...view, wallet: { coins: 650, gems: 40 } };
    answer = () => ({ granted: [], view: newer });
    // Refreshing the economy after a claim must read the committed balance too.
    view = newer;
    await act(async () => { await state.claimDaily(); });
    await act(async () => { old.resolve(response(fixture())); await old.promise; });
    expect(state.view!.wallet.coins).toBe(650);
    vi.mocked(fetch).mockImplementation(normal);
  });

  it('refreshes the other wallet when a pass purchase returns no item grant', async () => {
    await render(<Probe />);
    const before = calls.filter((call) => call.path === '/api/economy').length;
    answer = () => ({ granted: [], view });
    await act(async () => { await state.buy('season_pass'); });
    expect(calls.filter((call) => call.path === '/api/economy').length).toBe(before + 1);
  });

  it('discards a late action error after switching accounts and unlocks the new account', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    cleanups.push(() => { act(() => root.unmount()); container.remove(); });
    const draw = (id: string | null) => root.render(<EconomyProvider accountKey={id} revision="1">
      <MetaProvider accountKey={id} revision="1"><Probe /></MetaProvider>
    </EconomyProvider>);
    await act(async () => draw('a'));
    const late = deferred<Response>();
    vi.mocked(fetch).mockImplementationOnce(() => late.promise);
    let action!: Promise<boolean>;
    act(() => { action = state.claimDaily(); });
    await act(async () => draw('b'));
    expect(state.busy).toBeNull();
    await act(async () => { late.resolve(response({ error: 'Old account error' }, 409)); await action; });
    expect(state.error).toBe('');
    expect(state.view).not.toBeNull();
    await act(async () => draw(null));
    expect(state.view).toBeNull();
    expect(state.loading).toBe(false);
  });

  it('waits for the exact Stars order and reports a rejected invoice request', async () => {
    const orderId = 'a'.repeat(24);
    const pay = vi.fn().mockResolvedValue({ status: 'paid', orderId });
    const container = document.createElement('div');
    const root = createRoot(container);
    cleanups.push(() => act(() => root.unmount()));
    await act(async () => root.render(<EconomyProvider accountKey="a" revision="1">
      <MetaProvider accountKey="a" revision="1" payWithStars={pay}><Probe /></MetaProvider>
    </EconomyProvider>));
    answer = (path) => path === `/api/meta/orders/${orderId}` ? { status: 'paid', granted: [{ kind: 'gems', amount: 500 }] } : {};
    await act(async () => { await state.checkout('gems_500'); });
    expect(calls.some((call) => call.path === `/api/meta/orders/${orderId}`)).toBe(true);
    expect(calls.some((call) => call.path.includes('/latest/'))).toBe(false);
    pay.mockRejectedValueOnce(new Error('Invoice unavailable'));
    await act(async () => { expect(await state.checkout('gems_500')).toBe(false); });
    expect(state.error).toBe('Invoice unavailable');
    expect(state.busy).toBeNull();
  });
});

describe('recoverable lobby feedback', () => {
  it('shows a failed season load and lets the player retry it', async () => {
    const normal = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (path, init) => path === '/api/meta'
      ? response({ error: 'Server unavailable' }, 503) : normal(path, init));
    const container = await render(<Pass />);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Server unavailable');
    expect(container.querySelector('.pass-page__skel')).toBeNull();
    Element.prototype.scrollIntoView ??= vi.fn();
    vi.mocked(fetch).mockImplementation(normal);
    await act(async () => { button(container, 'Try again')!.click(); });
    expect(container.querySelector('.pass-road')).not.toBeNull();
  });

  it('skips the reward animation permanently and restores the page after collection', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const container = await render(<Probe />);
    vi.useFakeTimers();
    answer = () => ({ view, granted: [{ kind: 'chest', chestId: 'battle', contents: [{ kind: 'coins', amount: 100 }] }] });
    await act(async () => { await state.claimDaily(); });
    expect(container.querySelector('dialog.reveal[open]')).not.toBeNull();
    act(() => button(container, 'Skip')!.click());
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(container.querySelector('.reveal--done')).not.toBeNull();
    expect(button(container, 'Skip')).toBeUndefined();
    act(() => button(container, 'Collect')!.click());
    expect(container.querySelector('.reveal')).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });
});

describe('the quest board', () => {
  it('opens on the starter chain and collects what is finished, with a reveal', async () => {
    answer = (path) =>
      path === '/api/meta/quests/claim'
        ? { granted: [{ kind: 'coins', amount: 150 }, { kind: 'item', itemId: 'title-first-light' }], view }
        : {};
    const container = await render(<QuestBoard />);
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain('Getting started');
    const collect = button(container, 'Collect');
    expect(collect).toBeDefined();
    expect(button(container, 'In progress')?.disabled).toBe(true);
    await act(async () => {
      collect!.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(calls.find((c) => c.path === '/api/meta/quests/claim')?.body).toEqual({ questId: 'st-first-duel' });
    // An item is worth the full moment.
    const reveal = document.querySelector('.reveal');
    expect(reveal?.textContent).toContain('First Light');
    expect(reveal?.textContent).toContain('150 coins');
  });

  it('marks the tab that has something to collect', async () => {
    view.quests.starter = [];
    view.quests.weekly = view.quests.weekly.map((q, i) => (i === 0 ? { ...q, progress: q.target, done: true } : q));
    const container = await render(<QuestBoard />);
    const weekly = [...container.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent?.includes('Weekly'));
    expect(weekly?.querySelector('.badge-dot')?.textContent).toBe('1');
  });
});

describe('the daily calendar', () => {
  it('lights today and ticks the days behind it', async () => {
    const container = await render(<DailyCalendar />);
    const days = [...container.querySelectorAll('.calendar__day')];
    expect(days).toHaveLength(7);
    expect(days.slice(0, 2).every((day) => day.classList.contains('is-claimed'))).toBe(true);
    expect(days[2]!.classList.contains('is-today')).toBe(true);
    expect(button(container, "Collect today's reward")?.disabled).toBe(false);
  });

  it('turns into a countdown once today is taken', async () => {
    view.calendar = { ...view.calendar, index: 3, claimedToday: true, claims: 3 };
    const container = await render(<DailyCalendar />);
    expect(container.querySelector('.calendar__day.is-next')).not.toBeNull();
    expect(button(container, 'Collected today')?.disabled).toBe(true);
  });
});

describe('the season card', () => {
  it('counts what is waiting and offers to collect it all', async () => {
    const container = await render(<SeasonCard onNavigate={() => {}} />);
    // Tier 1 free is taken; tier 2 free is waiting; premium is locked.
    expect(button(container, 'Collect 1')).toBeDefined();
    expect(container.textContent).toContain('Lights On');
  });
});

describe('buying', () => {
  it('asks before spending, and lists exactly what arrives', async () => {
    const bundle = view.store.offers.find((offer) => offer.id === 'bundle_arcade')!;
    view.wallet.gems = 1000;
    answer = (path) => (path === '/api/meta/buy' ? { granted: [{ kind: 'item', itemId: 'arcade-jacket' }], view } : {});
    const container = await render(<OfferCard offer={bundle} now={NOW} />);
    await act(async () => {
      container.querySelector<HTMLButtonElement>('.offer__buy')!.click();
    });
    expect(calls.some((c) => c.path === '/api/meta/buy')).toBe(false);
    const dialog = container.querySelector('dialog')!;
    expect(dialog.textContent).toContain('Arcade jacket');
    expect(dialog.textContent).toContain('450 gems');
    await act(async () => {
      button(dialog as unknown as HTMLElement, 'Buy')!.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(calls.find((c) => c.path === '/api/meta/buy')?.body).toEqual({ offerId: 'bundle_arcade' });
  });

  it('refuses to start a purchase the wallet cannot cover', async () => {
    const pass = view.store.offers.find((offer) => offer.id === 'season_pass')!;
    const container = await render(<OfferCard offer={pass} now={NOW} />);
    await act(async () => {
      container.querySelector<HTMLButtonElement>('.offer__buy')!.click();
    });
    const dialog = container.querySelector('dialog')!;
    expect(dialog.textContent).toContain('You need 560 more gems.');
    expect(button(dialog as unknown as HTMLElement, 'Buy')?.disabled).toBe(true);
  });

  it('shows no money prices where this server cannot take money', async () => {
    const container = await render(<Store />);
    expect(container.querySelector('#gems')).toBeNull();
    expect(container.textContent).not.toContain('$4.99');
    expect(container.textContent).toContain("Today's deals");
  });

  it('shows card prices once card payments are switched on', async () => {
    view.store.payments = { card: true, stars: false };
    const container = await render(<Store />);
    expect(container.querySelector('#gems')).not.toBeNull();
    expect(container.textContent).toContain('$4.99');
  });
});
