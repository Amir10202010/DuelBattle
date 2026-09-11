import { describe, expect, it } from 'vitest';
import {
  ROOM_CODE_LENGTH,
  extractRoomCode,
  generateRoomCode,
  isValidRoomCode,
  normalizeRoomCode,
  randomId,
} from '../src/ids.js';

describe('room codes', () => {
  it('generates codes that pass validation', () => {
    for (let i = 0; i < 500; i++) {
      const code = generateRoomCode();
      expect(code).toHaveLength(ROOM_CODE_LENGTH);
      expect(isValidRoomCode(code)).toBe(true);
    }
  });

  it('never emits the ambiguous letters', () => {
    const codes = Array.from({ length: 2000 }, () => generateRoomCode()).join('');
    expect(codes).not.toMatch(/[ILOU]/);
  });

  it('is stable at the extremes of the random source', () => {
    expect(isValidRoomCode(generateRoomCode(() => 0))).toBe(true);
    expect(isValidRoomCode(generateRoomCode(() => 0.999999))).toBe(true);
    // Math.random() is [0,1) but a hostile source might return exactly 1.
    expect(isValidRoomCode(generateRoomCode(() => 1))).toBe(true);
  });

  it('normalizes the look-alikes people actually type', () => {
    expect(normalizeRoomCode('ab-cd e')).toBe('ABCDE');
    expect(normalizeRoomCode('lo1ab')).toBe('101AB');
    expect(normalizeRoomCode('iIoO')).toBe('1100');
    expect(normalizeRoomCode('uu')).toBe('VV');
  });

  it('does not truncate a too-long code into a valid one', () => {
    // 'ABCDEFGH' must not quietly become 'ABCDE' and drop someone into a room
    // they were never invited to.
    expect(normalizeRoomCode('abcdefgh')).toBe('ABCDEFGH');
    expect(isValidRoomCode(normalizeRoomCode('abcdefgh'))).toBe(false);
  });

  it('rejects malformed codes', () => {
    expect(isValidRoomCode('')).toBe(false);
    expect(isValidRoomCode('ABC')).toBe(false);
    expect(isValidRoomCode('ABCDEF')).toBe(false);
    expect(isValidRoomCode('ABCDI')).toBe(false);
    expect(isValidRoomCode('abcde')).toBe(false);
  });
});

describe('extractRoomCode', () => {
  it('accepts a bare code however it was typed', () => {
    expect(extractRoomCode('AB12C')).toBe('AB12C');
    expect(extractRoomCode(' ab-12c ')).toBe('AB12C');
  });

  it('accepts a pasted invite link', () => {
    expect(extractRoomCode('https://battle.example/r/AB12C')).toBe('AB12C');
    expect(extractRoomCode('http://localhost:5173/r/ab12c')).toBe('AB12C');
    expect(extractRoomCode('come play: https://battle.example/r/AB12C?utm=x')).toBe('AB12C');
  });

  it('returns null rather than guessing', () => {
    expect(extractRoomCode('')).toBeNull();
    expect(extractRoomCode('ABC')).toBeNull();
    expect(extractRoomCode('ABCDEFGH')).toBeNull();
    expect(extractRoomCode('https://battle.example/')).toBeNull();
  });
});

describe('randomId', () => {
  it('produces distinct ids of the requested length', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => randomId(12)));
    expect(ids.size).toBe(1000);
    expect([...ids][0]).toHaveLength(12);
  });
});
