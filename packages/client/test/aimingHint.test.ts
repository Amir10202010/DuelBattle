import { describe, expect, it } from 'vitest';
import { CHALLENGES, type DetectorSpec } from '@battle/shared';
import { aimingHintForTesting as aimingHint } from '../src/screens/Arena.js';

describe('aimingHint', () => {
  it('tells you to cover the lens when the round wants darkness', () => {
    // The generic line used to say "hold it up so it fills the middle of the
    // frame" here, which is the opposite of the answer.
    const hint = aimingHint({ kind: 'darkness', maxLuminance: 0.05 });
    expect(hint).toMatch(/cover the lens/i);
    expect(hint).not.toMatch(/hold it up/i);
  });

  it('has something to say about every detector the catalogue ships', () => {
    const kinds = new Set<DetectorSpec['kind']>();
    for (const challenge of CHALLENGES) {
      if (!challenge.detector) continue;
      kinds.add(challenge.detector.kind);
      const hint = aimingHint(challenge.detector);
      expect(hint.length, challenge.prompt).toBeGreaterThan(0);
      expect(hint.length, challenge.prompt).toBeLessThanOrEqual(60);
    }
    // A guard against the catalogue quietly losing a detector kind entirely.
    expect(kinds.size).toBeGreaterThanOrEqual(5);
  });

  it('falls back to the peer line when nothing is watching', () => {
    expect(aimingHint(null)).toMatch(/opponent/i);
  });
});
