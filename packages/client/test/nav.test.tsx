// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { PublicProfile } from '@battle/shared';
import { Nav } from '../src/components/Nav.js';
import { EconomyProvider } from '../src/hooks/useEconomy.js';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

/** A signed-in player, which is the only state these cases are about. */
const profile = {
  id: 'p1',
  name: 'QA Pilot',
  rating: 1000,
  xp: 0,
  matchesPlayed: 0,
  wins: 0,
  streak: 0,
  bestStreak: 0,
  achievements: [],
  history: [],
  loadout: {},
} as unknown as PublicProfile;

function render(content: ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  // A null account key keeps the provider from reaching for the network.
  act(() => root.render(<EconomyProvider accountKey={null} revision="test">{content}</EconomyProvider>));
  cleanups.push(() => {
    act(() => root.unmount());
    container.remove();
  });
  return container;
}

const links = (container: HTMLElement) =>
  [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));

describe('the header on screens a player cannot leave yet', () => {
  /**
   * Onboarding is a gate: the app sends anybody who has not finished it
   * straight back. A header offering a way out is offering something it
   * cannot deliver — the player presses it and the screen does not change.
   */
  it('offers no way out of onboarding', () => {
    const container = render(
      <Nav page="onboarding" profile={profile} onNavigate={() => {}} publicOnly pinned />,
    );
    expect(links(container)).toEqual([]);
    expect(container.querySelector('.wordmark')).not.toBeNull();
    expect(container.textContent).not.toContain('Enter home');
  });

  it('still offers the way in from the pages a signed-in player may leave', () => {
    const container = render(
      <Nav page="login" profile={profile} onNavigate={() => {}} publicOnly />,
    );
    expect(links(container)).toContain('/home');
  });

  it('offers a signed-out visitor both doors', () => {
    const container = render(<Nav page="login" profile={null} onNavigate={() => {}} publicOnly />);
    expect(links(container)).toEqual(expect.arrayContaining(['/login', '/register']));
  });
});
