import { describe, expect, it } from 'vitest';
import {
  CHALLENGES,
  MAX_CUSTOM_CHALLENGES,
  normalizeCustomPrompt,
  validateCustomPrompt,
} from '../src/challenges.js';

describe('normalizeCustomPrompt', () => {
  it('sets prompts the way every other prompt in the game is set', () => {
    expect(normalizeCustomPrompt('  show me  your   oldest mug ')).toBe('SHOW ME YOUR OLDEST MUG');
  });

  it('trims to the length the layout can actually render', () => {
    expect(normalizeCustomPrompt('X'.repeat(80))).toHaveLength(48);
  });
});

describe('validateCustomPrompt', () => {
  it('accepts an ordinary prompt', () => {
    const result = validateCustomPrompt('show something older than this flat', []);
    expect(result).toEqual({ ok: true, prompt: 'SHOW SOMETHING OLDER THAN THIS FLAT' });
  });

  it('allows the punctuation people actually type', () => {
    for (const prompt of ["SHOW YOUR MUM'S FAVOURITE THING", 'SHOW SOMETHING UNDER $5', 'WHY NOT?']) {
      expect(validateCustomPrompt(prompt, []).ok, prompt).toBe(true);
    }
  });

  it('rejects something too short to be a round', () => {
    expect(validateCustomPrompt('go', [])).toEqual({ ok: false, error: 'too-short' });
    expect(validateCustomPrompt('   ', [])).toEqual({ ok: false, error: 'too-short' });
    // Digits alone are not a prompt.
    expect(validateCustomPrompt('12345', [])).toEqual({ ok: false, error: 'too-short' });
  });

  it('rejects something too long to read at a glance', () => {
    expect(validateCustomPrompt('SHOW ME '.repeat(20), [])).toEqual({
      ok: false,
      error: 'too-long',
    });
  });

  it('rejects characters that would break the layout or the reading', () => {
    const hostile = [
      'SHOW <b>THIS</b>',
      'SHOW‮THIS', // right-to-left override
      'SHOWTHIS', // a bell character
      'SHOW \u{1F389} THIS', // emoji do not render in the display face
    ];
    for (const prompt of hostile) {
      expect(validateCustomPrompt(prompt, []).ok, JSON.stringify(prompt)).toBe(false);
    }
  });

  it('refuses a duplicate, however it was typed', () => {
    const existing = [{ prompt: 'SHOW A RED MUG' }];
    expect(validateCustomPrompt('show a red mug', existing)).toEqual({
      ok: false,
      error: 'duplicate',
    });
  });

  it('refuses a prompt the catalogue already has', () => {
    const built = CHALLENGES[0]!.prompt;
    expect(validateCustomPrompt(built, [])).toEqual({ ok: false, error: 'duplicate' });
  });

  it('stops once the deck is full', () => {
    const full = Array.from({ length: MAX_CUSTOM_CHALLENGES }, (_, i) => ({ prompt: `P${i}` }));
    expect(validateCustomPrompt('SOMETHING NEW ENTIRELY', full)).toEqual({
      ok: false,
      error: 'deck-full',
    });
  });
});
