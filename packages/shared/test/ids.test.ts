import { describe, expect, it } from 'vitest';
import {
  ROOM_CODE_LENGTH,
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
    expect(normalizeRoomCode('abcdefgh')).toBe('ABCDE');
  });

  it('rejects malformed codes', () => {
    expect(isValidRoomCode('')).toBe(false);
    expect(isValidRoomCode('ABC')).toBe(false);
    expect(isValidRoomCode('ABCDEF')).toBe(false);
    expect(isValidRoomCode('ABCDI')).toBe(false);
    expect(isValidRoomCode('abcde')).toBe(false);
  });
});

describe('randomId', () => {
  it('produces distinct ids of the requested length', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => randomId(12)));
    expect(ids.size).toBe(1000);
    expect([...ids][0]).toHaveLength(12);
  });
});
