// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderHook } from './render.jsx';
import { PAGES, pagePath, roomPath, useRoute } from '../src/hooks/useRoute.js';

function at(pathname: string) {
  history.replaceState(null, '', pathname);
  return renderHook(() => useRoute());
}

describe('useRoute', () => {
  it('reads a room code out of a share link', () => {
    expect(at('/r/AB12C').current.code).toBe('AB12C');
  });

  it('accepts a link typed in the wrong case', () => {
    expect(at('/r/ab12c').current.code).toBe('AB12C');
  });

  it('folds the characters people mistype', () => {
    expect(at('/r/abi2c').current.code).toBe('AB12C');
  });

  it('has no code on the home page', () => {
    expect(at('/').current.code).toBeNull();
  });

  it('refuses a code that could never exist', () => {
    expect(at('/r/nope').current.code).toBeNull();
    expect(at('/r/ABCDEFGH').current.code).toBeNull();
    expect(at('/r/AB12C/extra').current.code).toBeNull();
  });

  it('builds the same path it parses', () => {
    expect(roomPath('AB12C')).toBe('/r/AB12C');
    expect(at(roomPath('AB12C')).current.code).toBe('AB12C');
  });
});

describe('pages', () => {
  it('round-trips every page in the navigation', () => {
    for (const page of PAGES) {
      expect(at(pagePath(page)).current.page).toBe(page);
    }
  });

  it('ignores a trailing slash', () => {
    expect(at('/leaderboard/').current.page).toBe('leaderboard');
  });

  it('falls back to home rather than showing nothing', () => {
    expect(at('/nowhere').current.page).toBe('home');
    expect(at('/play/deeper').current.page).toBe('home');
  });

  it('treats a room link as a seat, not a page', () => {
    const route = at('/r/AB12C').current;
    expect(route.code).toBe('AB12C');
    expect(route.page).toBe('home');
  });
});
