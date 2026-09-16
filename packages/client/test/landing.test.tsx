// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { LandingDemo } from '../src/components/landing/LandingDemo.js';
import { LandingModes } from '../src/components/landing/LandingModes.js';
import { LandingNav } from '../src/components/landing/LandingNav.js';
import { setPreferences } from '../src/i18n/preferences.js';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const cleanups: Array<() => void> = [];
let reduced = false;
let hidden = false;
let motionChanged: () => void;

function render(content: ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(content));
  cleanups.push(() => {
    act(() => root.unmount());
    container.remove();
  });
  return container;
}

function advance(ticks: number) {
  for (let i = 0; i < ticks; i++) act(() => vi.advanceTimersByTime(450));
}

beforeEach(() => {
  reduced = false;
  hidden = false;
  motionChanged = () => {};
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', () => ({
    get matches() {
      return reduced;
    },
    addEventListener: (_event: string, callback: () => void) => {
      motionChanged = callback;
    },
    removeEventListener: vi.fn(),
  }));
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  setPreferences({ language: 'en' });
});

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('landing preview', () => {
  it('plays once, can be replayed, and never requests the visitor’s camera', () => {
    const getUserMedia = vi.fn();
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    const view = render(<LandingDemo />);
    expect(view.textContent).toContain('Find your answer');
    advance(12);
    expect(view.textContent).toContain('Round won');
    expect(vi.getTimerCount()).toBe(0);
    expect(getUserMedia).not.toHaveBeenCalled();
    act(() => view.querySelector<HTMLButtonElement>('button')!.click());
    expect(view.textContent).toContain('Find your answer');
    advance(12);
    expect(view.textContent).toContain('Round won');
  });

  it('keeps a user-paused preview paused after leaving and returning to the tab', () => {
    const view = render(<LandingDemo />);
    advance(2);
    act(() => view.querySelector<HTMLButtonElement>('button')!.click());
    const timer = view.querySelector('.lp-demo__clock')!.textContent;
    act(() => {
      hidden = true;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    act(() => {
      hidden = false;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    advance(20);
    expect(view.querySelector('.lp-demo__clock')!.textContent).toBe(timer);
    expect(view.querySelector('button')!.getAttribute('aria-label')).toBe('Resume example round');
    act(() => view.querySelector<HTMLButtonElement>('button')!.click());
    advance(12);
    expect(view.textContent).toContain('Round won');
  });

  it('shows the complete demonstration without timers when reduced motion is requested', () => {
    reduced = true;
    const view = render(<LandingDemo />);
    expect(view.textContent).toContain('Round won');
    expect(vi.getTimerCount()).toBe(0);
    expect(view.querySelector('button')!.disabled).toBe(true);
    act(() => {
      reduced = false;
      motionChanged();
    });
    expect(view.textContent).toContain('Find your answer');
    act(() => {
      reduced = true;
      motionChanged();
    });
    expect(view.textContent).toContain('Round won');
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('landing navigation', () => {
  it('lets keyboard users switch modes and follow the matching product route', () => {
    const navigate = vi.fn();
    const view = render(<LandingModes onNavigate={navigate} />);
    const ranked = view.querySelector<HTMLButtonElement>('#mode-ranked')!;
    act(() =>
      ranked.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })),
    );
    expect(document.activeElement?.id).toBe('mode-quick');
    expect(view.querySelector('#mode-quick')!.getAttribute('aria-selected')).toBe('true');
    act(() => view.querySelector<HTMLAnchorElement>('[role="tabpanel"] a')!.click());
    expect(navigate).toHaveBeenCalledWith('/play');
    act(() =>
      view
        .querySelector<HTMLButtonElement>('#mode-quick')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })),
    );
    expect(document.activeElement?.id).toBe('mode-ranked');
    expect(view.querySelector('[role="tabpanel"] a')!.getAttribute('href')).toBe('/register');
  });

  it('exposes mobile section links and preserves the signed-in home route', () => {
    const navigate = vi.fn();
    const view = render(<LandingNav signedIn onNavigate={navigate} />);
    expect(view.querySelector('a[href="/home"]')).not.toBeNull();
    const toggle = view.querySelector<HTMLButtonElement>('button')!;
    act(() => toggle.click());
    const menu = view.querySelector('#landing-menu')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    act(() => menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(view.querySelector('#landing-menu')).toBeNull();
    expect(document.activeElement).toBe(toggle);
    act(() => toggle.click());
    act(() => toggle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });
});
