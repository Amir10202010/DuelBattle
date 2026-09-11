import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_BYTES } from '../src/protocol.js';
import { PROTOCOL_TYPES_AGREE, clientMessageSchema, nameSchema } from '../src/validation.js';

const jpeg = (bytes = 64) => `data:image/jpeg;base64,${'A'.repeat(bytes)}`;

describe('protocol schema', () => {
  it('agrees with the hand-written message type', () => {
    // The real check happens at compile time; this keeps it from being deleted.
    expect(PROTOCOL_TYPES_AGREE).toBe(true);
  });

  it('accepts every message a client legitimately sends', () => {
    const messages = [
      { t: 'hello', protocol: 1 },
      { t: 'createRoom', name: 'Ada' },
      { t: 'joinRoom', code: 'AB12C', name: 'Ada' },
      { t: 'rejoin', code: 'AB12C', token: 'a'.repeat(32) },
      { t: 'cameraReady', ready: true },
      { t: 'ready', ready: false },
      { t: 'submit', roundId: 'r1', image: jpeg() },
      { t: 'vote', roundId: 'r1', targetId: 'p2', approve: true },
      { t: 'rematch' },
      { t: 'leave' },
      { t: 'ping', id: 3 },
      { t: 'frame', image: jpeg(), seq: 0 },
    ];
    for (const message of messages) {
      expect(clientMessageSchema.safeParse(message).success, JSON.stringify(message)).toBe(true);
    }
  });

  it('rejects anything that is not a known message', () => {
    for (const bad of [null, 42, 'hello', {}, { t: 'nope' }, { t: 'submit' }]) {
      expect(clientMessageSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('refuses an image format the server cannot verify', () => {
    // JPEG only, because the server re-runs the detector on the bytes it gets.
    for (const image of [
      'data:image/png;base64,AAAA',
      'data:image/webp;base64,AAAA',
      'https://example.com/cat.jpg',
      'data:image/jpeg;base64,not base64!',
    ]) {
      expect(clientMessageSchema.safeParse({ t: 'submit', roundId: 'r', image }).success).toBe(false);
    }
  });

  it('caps image size before anything tries to decode it', () => {
    const huge = jpeg(MAX_IMAGE_BYTES + 1);
    expect(clientMessageSchema.safeParse({ t: 'submit', roundId: 'r', image: huge }).success).toBe(
      false,
    );
  });

  it('holds live frames to a tighter budget than evidence', () => {
    const evidenceSized = jpeg(100_000);
    expect(
      clientMessageSchema.safeParse({ t: 'submit', roundId: 'r', image: evidenceSized }).success,
    ).toBe(true);
    expect(clientMessageSchema.safeParse({ t: 'frame', image: evidenceSized, seq: 1 }).success).toBe(
      false,
    );
  });

  it('rejects room codes that could not have been issued', () => {
    for (const code of ['', 'abc', 'ABCDEF', 'ABCDI', 'ab12c']) {
      expect(clientMessageSchema.safeParse({ t: 'joinRoom', code, name: 'Ada' }).success).toBe(false);
    }
  });
});

describe('names', () => {
  it('trims and accepts ordinary names', () => {
    expect(nameSchema.parse('  Ada  ')).toBe('Ada');
    expect(nameSchema.parse('Ada Lovelace')).toBe('Ada Lovelace');
    expect(nameSchema.parse('안녕')).toBe('안녕');
    expect(nameSchema.parse('\u{1F419}')).toBe('\u{1F419}');
  });

  it('rejects empty or oversized names', () => {
    expect(nameSchema.safeParse('').success).toBe(false);
    expect(nameSchema.safeParse('   ').success).toBe(false);
    expect(nameSchema.safeParse('x'.repeat(64)).success).toBe(false);
  });

  it('rejects the characters used to grief a scoreboard', () => {
    const hostile = [
      'Ada', // a bell character
      'Ada​​', // zero-width padding to fake a longer name
      '‮Ada', // right-to-left override
      'A⁦da', // directional isolate
    ];
    for (const name of hostile) {
      expect(nameSchema.safeParse(name).success, JSON.stringify(name)).toBe(false);
    }
  });
});
