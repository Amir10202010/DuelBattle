import { describe, expect, it } from 'vitest';
import {
  getChallenge,
  type DetectorSpec,
  type PublicMatchState,
  type ServerMessage,
} from '@battle/shared';
import { Room } from '../src/room.js';
import { JudgeUnavailable, type AiJudge, type JudgePhoto } from '../src/ai/judge.js';
import {
  BLUE,
  emptyRoomFrame,
  failingFrameFor,
  heldObjectFrame,
  passingFrameFor,
} from './helpers.js';

class Recorder {
  readonly messages: ServerMessage[] = [];
  readonly send = (m: ServerMessage) => {
    this.messages.push(m);
  };

  get state(): PublicMatchState {
    const last = [...this.messages].reverse().find((m) => m.t === 'state');
    if (!last || last.t !== 'state') throw new Error('no state received');
    return last.state;
  }

  ofType<T extends ServerMessage['t']>(t: T): Extract<ServerMessage, { t: T }>[] {
    return this.messages.filter((m): m is Extract<ServerMessage, { t: T }> => m.t === t);
  }

  clear(): void {
    this.messages.length = 0;
  }
}

interface Harness {
  room: Room;
  p1: string;
  p2: string;
  r1: Recorder;
  r2: Recorder;
}

/** Two seated players with cameras on, at t=0. */
function seated(): Harness {
  const room = new Room('ABCDE', 0);
  const a = room.join('Ada', 0);
  const b = room.join('Grace', 0);
  const p1 = a.playerId!;
  const p2 = b.playerId!;
  const r1 = new Recorder();
  const r2 = new Recorder();
  room.attach(p1, r1.send, 0);
  room.attach(p2, r2.send, 0);
  room.handle(p1, { t: 'cameraReady', ready: true }, 0);
  room.handle(p2, { t: 'cameraReady', ready: true }, 0);
  return { room, p1, p2, r1, r2 };
}

/**
 * Runs a match up to a live challenge, with or without the live frames the
 * server needs to take a baseline. Skipping the frames is the supported way to
 * reach peer judging deterministically: an unverifiable round is handed to the
 * opponent.
 */
function intoChallenge(
  h: Harness,
  opts: { at?: number; withBaseline?: boolean | 'p1Only' } = {},
): { roundId: string; detector: DetectorSpec | null } {
  const at = opts.at ?? 4_000;
  h.room.handle(h.p1, { t: 'ready', ready: true }, 100);
  h.room.handle(h.p2, { t: 'ready', ready: true }, 100);
  if (opts.withBaseline !== false) {
    h.room.handle(h.p1, { t: 'frame', image: emptyRoomFrame(), seq: 1 }, 200);
    // 'p1Only' is the lopsided case: one camera was readable and the other was
    // not, which is what makes a round fall back to judging half-decided.
    if (opts.withBaseline !== 'p1Only') {
      h.room.handle(h.p2, { t: 'frame', image: emptyRoomFrame(), seq: 1 }, 200);
    }
  }
  h.room.tick(at);

  const state = h.r1.state;
  expect(state.phase).toBe('challenge');
  const challenge = getChallenge(state.round!.challengeId)!;
  // Round one is always auto-judged, but which detector it draws is random —
  // the frames the test holds up are derived from whichever one turned up.
  expect(challenge.judging).toBe('auto');
  return { roundId: state.round!.id, detector: challenge.detector ?? null };
}

describe('room membership', () => {
  it('seats two players and refuses a third', () => {
    const room = new Room('ABCDE', 0);
    expect(room.join('Ada', 0).ok).toBe(true);
    expect(room.join('Grace', 0).ok).toBe(true);
    const third = room.join('Alan', 0);
    expect(third.ok).toBe(false);
    expect(third.error).toBe('room-full');
  });

  it('issues an unguessable session token per seat', () => {
    const room = new Room('ABCDE', 0);
    const a = room.join('Ada', 0);
    const b = room.join('Grace', 0);
    expect(a.token).not.toBe(b.token);
    expect(a.token!.length).toBeGreaterThanOrEqual(24);
  });

  it('restores a seat from its token and refuses a forged one', () => {
    const room = new Room('ABCDE', 0);
    const a = room.join('Ada', 0);
    expect(room.rejoin(a.token!, 1_000).playerId).toBe(a.playerId);
    const forged = room.rejoin('not-a-real-token', 1_000);
    expect(forged.ok).toBe(false);
    expect(forged.error).toBe('session-expired');
  });

  it('sends a fresh player the current state immediately', () => {
    const room = new Room('ABCDE', 0);
    const a = room.join('Ada', 0);
    const rec = new Recorder();
    room.attach(a.playerId!, rec.send, 0);
    expect(rec.state.phase).toBe('lobby');
    expect(rec.state.players[a.playerId!]?.name).toBe('Ada');
  });

  it('boots a stale tab when the same seat connects again', () => {
    const room = new Room('ABCDE', 0);
    const a = room.join('Ada', 0);
    const first = new Recorder();
    const second = new Recorder();
    room.attach(a.playerId!, first.send, 0);
    room.attach(a.playerId!, second.send, 10);
    const fatal = first.ofType('error').find((e) => e.fatal);
    expect(fatal?.message).toMatch(/another tab/i);
    expect(second.state.phase).toBe('lobby');
  });

  it('pauses the match when someone drops and resumes when they return', () => {
    const h = seated();
    intoChallenge(h);
    h.room.detach(h.p2, 5_000);
    expect(h.r1.state.paused).not.toBeNull();

    const returning = new Recorder();
    h.room.attach(h.p2, returning.send, 9_000);
    expect(returning.state.paused).toBeNull();
  });
});

describe('live frames', () => {
  it('relays a frame to the opponent and never back to the sender', () => {
    const h = seated();
    h.r1.clear();
    h.r2.clear();
    h.room.handle(h.p1, { t: 'frame', image: emptyRoomFrame(), seq: 7 }, 1_000);
    expect(h.r1.ofType('peerFrame')).toHaveLength(0);
    expect(h.r2.ofType('peerFrame')).toHaveLength(1);
    expect(h.r2.ofType('peerFrame')[0]?.playerId).toBe(h.p1);
  });

  it('throttles relaying regardless of how fast a client sends', () => {
    const h = seated();
    h.r2.clear();
    for (let i = 0; i < 10; i++) {
      h.room.handle(h.p1, { t: 'frame', image: emptyRoomFrame(), seq: i }, 1_000 + i * 10);
    }
    expect(h.r2.ofType('peerFrame').length).toBeLessThanOrEqual(2);
  });
});

describe('auto-judged rounds', () => {
  it('accepts an answer that satisfies the round, whatever it asked for', () => {
    const h = seated();
    const { roundId, detector } = intoChallenge(h);
    const image = passingFrameFor(detector!);

    h.room.handle(h.p1, { t: 'submit', roundId, image }, 5_500);
    // The round stays open a beat for a photo finish, then scores.
    h.room.tick(h.r1.state.phaseEndsAt!);

    const state = h.r1.state;
    expect(state.phase).toBe('roundResult');
    expect(state.round?.outcome?.winnerId).toBe(h.p1);
    expect(state.round?.submissions[h.p1]?.auto?.matched).toBe(true);
    expect(state.players[h.p1]?.score).toBe(1);
  });

  it('rejects a wrong answer even though the client cannot claim otherwise', () => {
    const h = seated();
    const { roundId, detector } = intoChallenge(h);

    h.room.handle(h.p1, { t: 'submit', roundId, image: failingFrameFor(detector!) }, 5_500);
    const state = h.r1.state;
    expect(state.phase).toBe('challenge');
    expect(state.players[h.p1]?.submitted).toBe(true);
    expect(state.players[h.p1]?.score).toBe(0);
  });

  it('does not reveal a verdict while the round is still live', () => {
    const h = seated();
    const { roundId, detector } = intoChallenge(h);
    h.room.handle(h.p1, { t: 'submit', roundId, image: failingFrameFor(detector!) }, 5_500);
    const seenByOpponent = h.r2.state;
    expect(seenByOpponent.phase).toBe('challenge');
    expect(seenByOpponent.round?.submissions).toEqual({});
  });

  it('tells a player who just missed the window what actually happened', () => {
    const h = seated();
    const { roundId, detector } = intoChallenge(h);
    h.room.handle(h.p1, { t: 'submit', roundId, image: passingFrameFor(detector!) }, 5_000);
    h.room.tick(h.r1.state.phaseEndsAt!);
    expect(h.r1.state.phase).toBe('roundResult');

    h.room.handle(h.p2, { t: 'submit', roundId, image: passingFrameFor(detector!) }, 6_000);
    expect(h.r2.ofType('error').at(-1)?.message).toMatch(/just too late/i);
  });

  it('ignores a submission aimed at a round that has moved on', () => {
    const h = seated();
    const { detector } = intoChallenge(h);
    h.r1.clear();
    h.room.handle(
      h.p1,
      { t: 'submit', roundId: 'stale-round', image: passingFrameFor(detector!) },
      5_500,
    );
    expect(h.r1.ofType('error')[0]?.code).toBe('rejected');
  });

  it('refuses a snapshot it cannot decode instead of scoring it', () => {
    const h = seated();
    const { roundId } = intoChallenge(h);
    const junk = `data:image/jpeg;base64,${Buffer.from('nope').toString('base64')}`;
    h.room.handle(h.p1, { t: 'submit', roundId, image: junk }, 5_500);
    expect(h.r1.ofType('error').at(-1)?.message).toMatch(/could not be read/);
    // The round carries on as if nothing was sent, so the player can retry.
    expect(h.r1.state.phase).toBe('challenge');
    expect(h.r1.state.players[h.p1]?.submitted).toBe(false);
  });

  it('hands the round to the opponent when it has no baseline to judge against', () => {
    const h = seated();
    // No frames sent, so the server never saw the room before the prompt.
    const { roundId } = intoChallenge(h, { withBaseline: false });

    h.room.handle(h.p1, { t: 'submit', roundId, image: heldObjectFrame(BLUE) }, 5_000);

    expect(h.r1.state.round?.judging).toBe('peer');
    expect(h.r1.ofType('toast').at(-1)?.message).toMatch(/opponent judges/i);
    // And the answer is now waiting on a vote rather than being scored blind.
    expect(h.r1.state.phase).toBe('challenge');
  });

  it('discards a baseline that is too old to describe the room', () => {
    const h = seated();
    h.room.handle(h.p1, { t: 'ready', ready: true }, 100);
    h.room.handle(h.p2, { t: 'ready', ready: true }, 100);
    // Frames stop arriving long before the prompt is revealed.
    h.room.handle(h.p1, { t: 'frame', image: emptyRoomFrame(), seq: 1 }, 200);
    h.room.handle(h.p2, { t: 'frame', image: emptyRoomFrame(), seq: 1 }, 200);
    h.room.tick(30_000);
    const roundId = h.r1.state.round!.id;
    h.room.handle(h.p1, { t: 'submit', roundId, image: heldObjectFrame(BLUE) }, 31_000);
    expect(h.r1.state.round?.judging).toBe('peer');
  });
});

describe('evidence handling', () => {
  it('shows a judge their opponent’s answer and not their own', () => {
    const h = seated();
    const { roundId } = intoChallenge(h, { withBaseline: false });
    h.room.handle(h.p1, { t: 'submit', roundId, image: heldObjectFrame(BLUE) }, 5_000);
    h.room.handle(h.p2, { t: 'submit', roundId, image: heldObjectFrame(BLUE) }, 5_100);
    expect(h.r1.state.phase).toBe('judging');

    const forP1 = h.r1.ofType('evidence');
    expect(forP1.length).toBeGreaterThan(0);
    expect(forP1.every((e) => e.playerId !== h.p1)).toBe(true);
    expect(forP1.some((e) => e.playerId === h.p2)).toBe(true);
  });

  it('resolves a peer round on the opponents’ votes', () => {
    const h = seated();
    const { roundId } = intoChallenge(h, { withBaseline: false });
    h.room.handle(h.p1, { t: 'submit', roundId, image: heldObjectFrame(BLUE) }, 5_000);
    h.room.handle(h.p2, { t: 'submit', roundId, image: heldObjectFrame(BLUE) }, 5_100);
    h.room.handle(h.p1, { t: 'vote', roundId, targetId: h.p2, approve: true }, 6_000);
    h.room.handle(h.p2, { t: 'vote', roundId, targetId: h.p1, approve: true }, 6_100);

    const state = h.r1.state;
    expect(state.phase).toBe('roundResult');
    expect(state.round?.outcome?.winnerId).toBe(h.p1);
    expect(state.players[h.p1]?.score).toBe(1);
  });

  it('lets nobody score the round somebody rejected', () => {
    const h = seated();
    const { roundId } = intoChallenge(h, { withBaseline: false });
    h.room.handle(h.p1, { t: 'submit', roundId, image: heldObjectFrame(BLUE) }, 5_000);
    h.room.handle(h.p2, { t: 'submit', roundId, image: heldObjectFrame(BLUE) }, 5_100);
    // p2 was slower and would have lost. Saying no must not hand them the round.
    h.room.handle(h.p2, { t: 'vote', roundId, targetId: h.p1, approve: false }, 6_000);
    h.room.handle(h.p1, { t: 'vote', roundId, targetId: h.p2, approve: true }, 6_100);

    const state = h.r1.state;
    expect(state.phase).toBe('roundResult');
    expect(state.round?.outcome?.winnerId).toBeNull();
    expect(state.players[h.p1]?.score).toBe(0);
    expect(state.players[h.p2]?.score).toBe(0);
  });

  it('keeps the camera’s verdict when only one frame could be read', () => {
    const h = seated();
    const { roundId, detector } = intoChallenge(h, { withBaseline: 'p1Only' });
    // p1 is readable and gets it wrong; p2 has no baseline, so the round falls
    // back to judging with p1 already decided.
    h.room.handle(h.p1, { t: 'submit', roundId, image: failingFrameFor(detector!) }, 5_000);
    h.room.handle(h.p2, { t: 'submit', roundId, image: heldObjectFrame(BLUE) }, 5_100);
    expect(h.r1.state.phase).toBe('judging');
    expect(h.r1.state.round?.submissions[h.p1]?.needsVerdict).toBe(false);
    expect(h.r1.state.round?.submissions[h.p2]?.needsVerdict).toBe(true);

    // p2 cannot vote p1's failed answer back into the round, and p1 approving
    // p2 leaves p2 the only valid answer.
    h.room.handle(h.p2, { t: 'vote', roundId, targetId: h.p1, approve: true }, 6_000);
    expect(h.r2.ofType('error').at(-1)?.message).toMatch(/camera already settled/i);
    h.room.handle(h.p1, { t: 'vote', roundId, targetId: h.p2, approve: true }, 6_100);

    const state = h.r1.state;
    expect(state.phase).toBe('roundResult');
    expect(state.round?.outcome?.perPlayer[h.p1]?.valid).toBe(false);
    expect(state.round?.outcome?.winnerId).toBe(h.p2);
  });

  it('refuses a vote on your own answer', () => {
    const h = seated();
    const { roundId } = intoChallenge(h, { withBaseline: false });
    h.room.handle(h.p1, { t: 'submit', roundId, image: heldObjectFrame(BLUE) }, 5_000);
    h.room.handle(h.p2, { t: 'submit', roundId, image: heldObjectFrame(BLUE) }, 5_100);
    h.room.handle(h.p1, { t: 'vote', roundId, targetId: h.p1, approve: true }, 6_000);
    expect(h.r1.ofType('error').at(-1)?.message).toMatch(/cannot judge your own/i);
  });

  it('shows both answers to both players once the round resolves', () => {
    const h = seated();
    const { roundId, detector } = intoChallenge(h);
    h.room.handle(h.p1, { t: 'submit', roundId, image: passingFrameFor(detector!) }, 5_000);
    h.room.tick(h.r1.state.phaseEndsAt!);
    expect(h.r1.state.phase).toBe('roundResult');
    const owners = new Set(h.r2.ofType('evidence').map((e) => e.playerId));
    expect(owners.has(h.p1)).toBe(true);
  });

  it('replays the visible evidence to a player who reconnects mid-result', () => {
    const h = seated();
    const { roundId, detector } = intoChallenge(h);
    h.room.handle(h.p1, { t: 'submit', roundId, image: passingFrameFor(detector!) }, 5_000);
    h.room.tick(h.r1.state.phaseEndsAt!);
    h.room.detach(h.p2, 5_200);

    const returning = new Recorder();
    h.room.attach(h.p2, returning.send, 5_400);
    expect(returning.ofType('evidence').length).toBeGreaterThan(0);
  });
});

describe('memory', () => {
  /**
   * Snapshots are the largest thing a room holds, and a room can run for
   * thirteen rounds. Holding one round of them is the difference between a
   * server that survives a full table and one that does not.
   */
  it('never holds more than one round of snapshots', () => {
    const h = seated();
    const { roundId, detector } = intoChallenge(h);
    h.room.handle(h.p1, { t: 'submit', roundId, image: passingFrameFor(detector!) }, 5_000);
    h.room.tick(h.r1.state.phaseEndsAt!);
    expect(h.r1.state.phase).toBe('roundResult');
    expect(h.room.retainedEvidenceRounds).toBe(1);

    // Into the next round, and the one before it should be gone.
    h.room.tick(h.r1.state.phaseEndsAt!);
    expect(h.r1.state.phase).toBe('countdown');
    expect(h.room.retainedEvidenceRounds).toBe(0);

    const second = h.r1.state.round!;
    h.room.tick(h.r1.state.phaseEndsAt!);
    h.room.handle(
      h.p1,
      { t: 'submit', roundId: second.id, image: heldObjectFrame(BLUE) },
      40_000,
    );
    expect(h.room.retainedEvidenceRounds).toBeLessThanOrEqual(1);
  });
});

describe('collection', () => {
  it('marks a room collectable once it has been empty long enough', () => {
    const room = new Room('ABCDE', 0);
    const a = room.join('Ada', 0);
    const rec = new Recorder();
    room.attach(a.playerId!, rec.send, 0);
    expect(room.isCollectable(10_000, 5_000, 1_000_000)).toBe(false);
    room.detach(a.playerId!, 10_000);
    expect(room.isCollectable(14_000, 5_000, 1_000_000)).toBe(false);
    expect(room.isCollectable(16_000, 5_000, 1_000_000)).toBe(true);
  });

  it('collects a very old room even while someone is still connected', () => {
    const room = new Room('ABCDE', 0);
    const a = room.join('Ada', 0);
    room.attach(a.playerId!, new Recorder().send, 0);
    expect(room.isCollectable(2_000_000, 5_000, 1_000_000)).toBe(true);
  });
});

describe('a round the AI referee takes', () => {
  const AI_PROMPT = getChallenge('obj-face')!;

  /** Two seated players in a room whose deck is one AI-verifiable prompt. */
  function seatedWithJudge(judge: AiJudge): Harness {
    const room = new Room('AIRM1', 0, { judge, pool: [AI_PROMPT] });
    const a = room.join('Ada', 0);
    const b = room.join('Grace', 0);
    const p1 = a.playerId!;
    const p2 = b.playerId!;
    const r1 = new Recorder();
    const r2 = new Recorder();
    room.attach(p1, r1.send, 0);
    room.attach(p2, r2.send, 0);
    room.handle(p1, { t: 'cameraReady', ready: true }, 0);
    room.handle(p2, { t: 'cameraReady', ready: true }, 0);
    return { room, p1, p2, r1, r2 };
  }

  function intoAiRound(h: Harness): string {
    h.room.handle(h.p1, { t: 'ready', ready: true }, 100);
    h.room.handle(h.p2, { t: 'ready', ready: true }, 100);
    h.room.handle(h.p1, { t: 'frame', image: emptyRoomFrame(), seq: 1 }, 200);
    h.room.handle(h.p2, { t: 'frame', image: emptyRoomFrame(), seq: 1 }, 200);
    h.room.tick(4_000);
    const state = h.r1.state;
    expect(state.phase).toBe('challenge');
    expect(state.round?.judging).toBe('ai');
    return state.round!.id;
  }

  /** Lets the referee's promise chain finish. */
  const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

  it('sends both photos to the referee and settles the round on the reply', async () => {
    let seen: JudgePhoto[] = [];
    const judge: AiJudge = {
      judge: ({ photos }) => {
        seen = [...photos];
        return Promise.resolve(
          photos.map((p, i) => ({
            playerId: p.playerId,
            valid: true,
            confidence: 0.9,
            fulfillment: 50,
            presentation: 20,
            objects: ['mug'],
            reason: `Slot ${i}: a mug with a face.`,
            score: 70,
          })),
        );
      },
    };
    const h = seatedWithJudge(judge);
    const roundId = intoAiRound(h);

    h.room.handle(h.p1, { t: 'submit', roundId, image: heldObjectFrame(BLUE) }, 5_000);
    h.room.handle(h.p2, { t: 'submit', roundId, image: heldObjectFrame(BLUE) }, 5_100);

    // Both answered, so the referee has it and nobody is offered a vote.
    expect(h.r1.state.phase).toBe('judging');
    expect(h.r1.state.round?.aiPending).toBe(true);

    await settle();

    const state = h.r1.state;
    expect(state.phase).toBe('roundResult');
    expect(state.round?.aiPending).toBe(false);
    // Both answers stood, so the faster one takes it.
    expect(state.round?.outcome?.winnerId).toBe(h.p1);
    expect(state.players[h.p1]?.score).toBe(1);

    // The "before" frame goes up as context, so the referee can tell a thing
    // fetched from a thing that was already there.
    expect(seen).toHaveLength(2);
    expect(seen.every((p) => p.contextImages.length === 1)).toBe(true);
  });

  it('lets the referee rule an answer out', async () => {
    const judge: AiJudge = {
      judge: ({ photos }) =>
        Promise.resolve(
          photos.map((p, i) => ({
            playerId: p.playerId,
            valid: i === 1,
            confidence: 0.9,
            fulfillment: i === 1 ? 60 : 0,
            presentation: i === 1 ? 20 : 0,
            objects: [],
            reason: i === 1 ? 'A poster of a face.' : 'Nothing with a face is visible.',
            score: i === 1 ? 80 : 0,
          })),
        ),
    };
    const h = seatedWithJudge(judge);
    const roundId = intoAiRound(h);
    h.room.handle(h.p1, { t: 'submit', roundId, image: heldObjectFrame(BLUE) }, 5_000);
    h.room.handle(h.p2, { t: 'submit', roundId, image: heldObjectFrame(BLUE) }, 5_100);
    await settle();

    const outcome = h.r1.state.round?.outcome;
    // Whoever the referee ruled out does not win it by being faster.
    expect(outcome?.winnerId).toBeDefined();
    const invalid = Object.entries(outcome!.perPlayer).filter(([, r]) => !r.valid);
    expect(invalid).toHaveLength(1);
    expect(outcome?.winnerId).not.toBe(invalid[0]![0]);
  });

  it('hands the round back to the opponent when the referee cannot answer', async () => {
    const judge: AiJudge = {
      judge: () => Promise.reject(new JudgeUnavailable('out of quota')),
    };
    const h = seatedWithJudge(judge);
    const roundId = intoAiRound(h);
    h.room.handle(h.p1, { t: 'submit', roundId, image: heldObjectFrame(BLUE) }, 5_000);
    h.room.handle(h.p2, { t: 'submit', roundId, image: heldObjectFrame(BLUE) }, 5_100);
    await settle();

    const state = h.r1.state;
    expect(state.phase).toBe('judging');
    expect(state.round?.judging).toBe('peer');
    expect(state.round?.aiPending).toBe(false);
    // And the players can now actually judge it.
    expect(state.round?.submissions[h.p2]?.needsVerdict).toBe(true);

    // A verdict during judging is deliberately not revealed, so the observable
    // proof the vote landed is that the answer stops waiting for one.
    h.room.handle(h.p1, { t: 'vote', roundId, targetId: h.p2, approve: true }, 6_000);
    expect(h.r1.ofType('error')).toHaveLength(0);
    expect(h.r1.state.round?.submissions[h.p2]?.needsVerdict).toBe(false);
  });

  it('does not crash the round when the referee throws something unexpected', async () => {
    const judge: AiJudge = { judge: () => Promise.reject(new Error('socket hang up')) };
    const h = seatedWithJudge(judge);
    const roundId = intoAiRound(h);
    h.room.handle(h.p1, { t: 'submit', roundId, image: heldObjectFrame(BLUE) }, 5_000);
    h.room.handle(h.p2, { t: 'submit', roundId, image: heldObjectFrame(BLUE) }, 5_100);
    await settle();

    expect(h.r1.state.round?.judging).toBe('peer');
    expect(h.r1.state.phase).toBe('judging');
  });

  it('leaves the prompt with the opponent when no referee is configured', () => {
    const room = new Room('NOAI1', 0, { pool: [AI_PROMPT] });
    const a = room.join('Ada', 0);
    const b = room.join('Grace', 0);
    const rec = new Recorder();
    room.attach(a.playerId!, rec.send, 0);
    room.handle(a.playerId!, { t: 'cameraReady', ready: true }, 0);
    room.handle(b.playerId!, { t: 'cameraReady', ready: true }, 0);
    room.handle(a.playerId!, { t: 'ready', ready: true }, 100);
    room.handle(b.playerId!, { t: 'ready', ready: true }, 100);
    room.tick(4_000);

    expect(rec.state.round?.judging).toBe('peer');
  });
});
