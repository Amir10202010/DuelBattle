import { describe, expect, it } from 'vitest';
import { extractRoomCode, parsePlayerName, ROOM_CODE_PATTERN } from '../shared/identity';
import { coverCrop } from '../src/media/capture';
import { ANALYSIS_HEIGHT, ANALYSIS_WIDTH } from '../shared/vision/frame';
import { EVIDENCE_HEIGHT, EVIDENCE_WIDTH } from '../src/media/capture';

describe('joining from a pasted code or link', () => {
  it('accepts a bare code in any case', () => {
    expect(extractRoomCode('a1b2c3d4e5')).toBe('A1B2C3D4E5');
    expect(extractRoomCode('  A1B2C3D4E5 ')).toBe('A1B2C3D4E5');
  });
  it('accepts a full invite link and a bare path', () => {
    expect(extractRoomCode('https://duelbattle.example/battle/a1b2c3d4e5')).toBe('A1B2C3D4E5');
    expect(extractRoomCode('https://duelbattle.example/battle/A1B2C3D4E5/')).toBe('A1B2C3D4E5');
    expect(extractRoomCode('/battle/a1b2c3d4e5')).toBe('A1B2C3D4E5');
  });
  it('never truncates an over-long code into a real room', () => {
    expect(extractRoomCode('A1B2C3D4E5FF')).toBeNull();
    expect(extractRoomCode('https://duelbattle.example/battle/a1b2c3d4e5ff')).toBeNull();
  });
  it('rejects the near misses', () => {
    for (const input of [
      '',
      'ZZZZZZZZZZ',
      'A1B2C3D4E',
      'https://duelbattle.example/',
      'not a code',
    ])
      expect(extractRoomCode(input)).toBeNull();
  });
  it('agrees with the pattern the server validates against', () => {
    const code = extractRoomCode('a1b2c3d4e5')!;
    expect(ROOM_CODE_PATTERN.test(code)).toBe(true);
  });
  it('shares one name rule with the server schema', () => {
    expect(parsePlayerName('  Jamie  ')).toEqual({ success: true, data: 'Jamie' });
    expect(parsePlayerName('<img onerror=1>').success).toBe(false);
    expect(parsePlayerName('').success).toBe(false);
    expect(parsePlayerName('x'.repeat(21)).success).toBe(false);
  });
});

describe('one capture geometry for every consumer', () => {
  it('crops a wide camera to the target aspect, centred', () => {
    const crop = coverCrop(1280, 720, 4, 3);
    expect(crop.width / crop.height).toBeCloseTo(4 / 3);
    expect(crop.height).toBe(720);
    expect(crop.x).toBeCloseTo((1280 - 960) / 2);
    expect(crop.y).toBe(0);
  });
  it('crops a tall camera to the target aspect, centred', () => {
    const crop = coverCrop(480, 640, 4, 3);
    expect(crop.width).toBe(480);
    expect(crop.width / crop.height).toBeCloseTo(4 / 3);
    expect(crop.x).toBe(0);
    expect(crop.y).toBeCloseTo((640 - 360) / 2);
  });
  it('leaves a matching source untouched', () => {
    expect(coverCrop(640, 480, 4, 3)).toEqual({ x: 0, y: 0, width: 640, height: 480 });
  });
  it('shows the detector and the opponent the same field of view', () => {
    const source = coverCrop(1280, 720, EVIDENCE_WIDTH, EVIDENCE_HEIGHT);
    const analysis = coverCrop(1280, 720, ANALYSIS_WIDTH, ANALYSIS_HEIGHT);
    expect(source).toEqual(analysis);
  });
});
