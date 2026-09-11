// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { CHALLENGES, type PublicMatchState, type RoundOutcome } from '@battle/shared';
import { announcementFor } from '../src/components/Announcer.jsx';

const AUTO = CHALLENGES.find((c) => c.judging === 'auto')!;
const PEER = CHALLENGES.find((c) => c.judging === 'peer')!;

function state(overrides: Partial<PublicMatchState> = {}): PublicMatchState {
  return {
    roomCode: 'AB12C',
    phase: 'lobby',
    phaseEndsAt: null,
    seats: ['p1', 'p2'],
    players: {
      p1: { id: 'p1', name: 'Ada', seat: 0, connected: true, cameraReady: true, ready: false, score: 0, validAnswers: 0, rematchVote: false, submitted: false },
      p2: { id: 'p2', name: 'Grace', seat: 1, connected: true, cameraReady: true, ready: false, score: 0, validAnswers: 0, rematchVote: false, submitted: false },
    },
    round: null,
    roundNumber: 0,
    history: [],
    settings: { winTarget: 3, maxRounds: 9, countdownMs: 3200, judgingMs: 15000, roundResultMs: 5500 },
    paused: null,
    winnerId: null,
    endReason: null,
    version: 1,
    ...overrides,
  };
}

function round(challengeId: string, outcome: RoundOutcome | null = null) {
  const challenge = CHALLENGES.find((c) => c.id === challengeId)!;
  return {
    id: 'r1',
    number: 1,
    challengeId,
    judging: challenge.judging,
    startedAt: 0,
    outcome,
    submissions: {},
  };
}

describe('match narration', () => {
  it('spells the room code out, so it is not read as a word', () => {
    const said = announcementFor(state({ players: { p1: state().players.p1! } }), 'p1');
    expect(said).toContain('A B 1 2 C');
  });

  it('says when the opponent arrives', () => {
    expect(announcementFor(state(), 'p1')).toContain('Grace is here');
  });

  it('reads the prompt and who decides it', () => {
    const auto = announcementFor(state({ phase: 'challenge', round: round(AUTO.id) }), 'p1');
    expect(auto).toContain(AUTO.prompt);
    expect(auto).toContain('camera decides');

    const peer = announcementFor(state({ phase: 'challenge', round: round(PEER.id) }), 'p1');
    expect(peer).toContain('opponent decides');
  });

  it('never doubles the punctuation a reason already carries', () => {
    const outcome: RoundOutcome = {
      roundNumber: 1,
      challengeId: AUTO.id,
      judging: 'auto',
      winnerId: 'p1',
      reason: 'only-valid',
      perPlayer: { p1: { valid: true, elapsedMs: 900, note: 'That is the whole screen. Counted.' } },
    };
    const said = announcementFor(
      state({ phase: 'roundResult', round: round(AUTO.id, outcome) }),
      'p1',
    );
    expect(said).not.toMatch(/\.\./);
    expect(said).toContain('You won the round');
    expect(said).toContain('Score 0 to 0');
  });

  it('names the winner from the listener’s point of view', () => {
    const outcome: RoundOutcome = {
      roundNumber: 1,
      challengeId: AUTO.id,
      judging: 'auto',
      winnerId: 'p2',
      reason: 'only-valid',
      perPlayer: {},
    };
    const forLoser = announcementFor(state({ phase: 'roundResult', round: round(AUTO.id, outcome) }), 'p1');
    const forWinner = announcementFor(state({ phase: 'roundResult', round: round(AUTO.id, outcome) }), 'p2');
    expect(forLoser).toContain('Grace won the round');
    expect(forWinner).toContain('You won the round');
  });

  it('calls a scoreless round a draw rather than silence', () => {
    const outcome: RoundOutcome = {
      roundNumber: 1,
      challengeId: AUTO.id,
      judging: 'auto',
      winnerId: null,
      reason: 'both-failed',
      perPlayer: {},
    };
    expect(
      announcementFor(state({ phase: 'roundResult', round: round(AUTO.id, outcome) }), 'p1'),
    ).toContain('Nobody scored');
  });

  it('reports the end of the match, including an abandoned one', () => {
    expect(
      announcementFor(state({ phase: 'matchResult', winnerId: 'p1', endReason: 'target-reached' }), 'p1'),
    ).toContain('You win the match');
    expect(
      announcementFor(state({ phase: 'matchResult', endReason: 'abandoned' }), 'p1'),
    ).toContain('abandoned');
  });
});
