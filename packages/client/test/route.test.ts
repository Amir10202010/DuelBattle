// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderHook } from './render.jsx';
import { roomPath, useRoute } from '../src/hooks/useRoute.js';

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
