import { describe, expect, it } from 'vitest';
import { PARTY_CHALLENGES } from '../src/party.js';
import { getChallenge, isAiVerifiable } from '../src/challenges.js';
import { supportsRussian } from '../src/localization.js';
import { createMatch, reduce, tick, type Action, type MatchState } from '../src/game.js';

describe('short party rounds', () => {
  it('has translated, photo-checkable tasks with short deadlines', () => {
    expect(PARTY_CHALLENGES).toHaveLength(12);
    for (const task of PARTY_CHALLENGES) {
      expect(getChallenge(task.id)).toEqual(task);
      expect(isAiVerifiable(task)).toBe(true);
      expect(supportsRussian(task.prompt)).toBe(true);
      expect(task.durationMs).toBeLessThanOrEqual(20_000);
    }
  });
  it.each([true, false])('only deals pose challenges with an available referee=%s', (aiAvailable) => {
    const ctx = { now: 0, aiAvailable, newId: () => 'round', random: () => 0.1 };
    let state: MatchState = createMatch('PARTY', 0);
    const apply = (action: Action) => {
      const next = reduce(state, action, ctx);
      if (!next.ok) throw Error(next.error);
      state = next.state;
    };
    for (const playerId of ['a', 'b']) {
      apply({ type: 'join', playerId, name: playerId });
      apply({ type: 'setCameraReady', playerId, cameraReady: true });
    }
    apply({ type: 'setReady', playerId: 'a', ready: true });
    apply({ type: 'setReady', playerId: 'b', ready: true });
    // Let round one expire and start round two.
    for (let i = 0; i < 3; i++) state = tick(state, { ...ctx, now: state.phaseEndsAt });
    expect(state.roundNumber).toBe(2);
    expect(state.round?.challengeId.startsWith('party-')).toBe(aiAvailable);
  });
});
