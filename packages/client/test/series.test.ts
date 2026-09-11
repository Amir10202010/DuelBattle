// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { PublicMatchState } from '@battle/shared';
import { seriesLine } from '../src/components/Series.jsx';

function state(series: Record<string, number>, seats: [string | null, string | null] = ['p1', 'p2']): PublicMatchState {
  return {
    roomCode: 'AB12C',
    phase: 'matchResult',
    phaseEndsAt: null,
    seats,
    players: {
      p1: { id: 'p1', name: 'Ada', seat: 0, connected: true, cameraReady: true, ready: false, score: 0, validAnswers: 0, rematchVote: false, submitted: false },
      p2: { id: 'p2', name: 'Grace', seat: 1, connected: true, cameraReady: true, ready: false, score: 0, validAnswers: 0, rematchVote: false, submitted: false },
    },
    round: null,
    roundNumber: 0,
    history: [],
    series,
    settings: { winTarget: 3, maxRounds: 9, countdownMs: 3200, judgingMs: 15000, roundResultMs: 5500 },
    paused: null,
    winnerId: null,
    endReason: null,
    version: 1,
  };
}

describe('series line', () => {
  it('says nothing before anything has been settled', () => {
    expect(seriesLine(state({}), 'p1')).toBeNull();
  });

  it('marks the first match without pretending it is a lead', () => {
    expect(seriesLine(state({ p1: 1 }), 'p1')).toBe('First match yours.');
    expect(seriesLine(state({ p1: 1 }), 'p2')).toBe('First match to Ada.');
  });

  it('reads from the listener’s side', () => {
    expect(seriesLine(state({ p1: 2, p2: 1 }), 'p1')).toBe('You lead the night 2–1.');
    expect(seriesLine(state({ p1: 2, p2: 1 }), 'p2')).toBe('Ada leads the night 2–1.');
  });

  it('calls a level series level', () => {
    expect(seriesLine(state({ p1: 2, p2: 2 }), 'p1')).toBe('All square on the night, 2 each.');
  });

  it('counts only matches the two of you actually played', () => {
    // The engine clears the series when a seat changes hands, so this shape
    // should not arise; if it ever does, the line must still read sensibly.
    expect(seriesLine(state({ p1: 2 }, ['p1', null]), 'p1')).toBe('You lead the night 2–0.');
  });
});
