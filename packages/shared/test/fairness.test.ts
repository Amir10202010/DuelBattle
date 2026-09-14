import { describe, expect, it } from 'vitest';
import {
  CHALLENGES,
  createMatch,
  reduce,
  tick,
  countsForRating,
  type Action,
  type MatchState,
} from '@battle/shared';
const pool = CHALLENGES.filter((c) => c.judging === 'auto');
let roundId = 0;
const ctx = (now: number) => ({
  now,
  random: () => 0.1,
  newId: () => `r${++roundId}`,
  pool,
  ranked: true,
});
function act(s: MatchState, a: Action, at: number) {
  const r = reduce(s, a, ctx(at));
  if (!r.ok) throw new Error(r.error);
  return r.state;
}
function live() {
  let s = { ...createMatch('RANK1', 0), ranked: true };
  for (const id of ['a', 'b']) {
    s = act(s, { type: 'join', playerId: id, name: id }, 0) as typeof s;
    s = act(s, { type: 'setCameraReady', playerId: id, cameraReady: true }, 0) as typeof s;
  }
  for (const id of ['a', 'b'])
    s = act(s, { type: 'setReady', playerId: id, ready: true }, 0) as typeof s;
  return tick(s, ctx(s.phaseEndsAt));
}
function verifiedRound() {
  let s = live();
  const at = s.round!.startedAt;
  s = act(
    s,
    {
      type: 'submit',
      playerId: 'a',
      roundId: s.round!.id,
      evidenceId: 'a',
      auto: { matched: true, confidence: 1, reason: 'Verified' },
    },
    at + 1000,
  );
  s = act(
    s,
    {
      type: 'submit',
      playerId: 'b',
      roundId: s.round!.id,
      evidenceId: 'b',
      auto: { matched: false, confidence: 1, reason: 'Wrong answer' },
    },
    at + 1100,
  );
  return tick(s, ctx(s.phaseEndsAt));
}
describe('ranked fairness', () => {
  it('does not allow a player vote or custom setting to affect a ranked match', () => {
    const s = live();
    expect(
      reduce(
        s,
        { type: 'vote', playerId: 'a', roundId: s.round!.id, targetId: 'b', approve: false },
        ctx(5000),
      ).ok,
    ).toBe(false);
    expect(
      reduce(
        { ...s, phase: 'lobby' },
        { type: 'setWinTarget', playerId: 'a', winTarget: 5 },
        ctx(5000),
      ).ok,
    ).toBe(false);
  });
  it('rejects a late submission and an answer after a pass', () => {
    const s = live();
    expect(
      reduce(
        s,
        { type: 'submit', playerId: 'a', roundId: s.round!.id, evidenceId: 'a' },
        ctx(s.phaseEndsAt + 1),
      ).ok,
    ).toBe(false);
    const passed = act(
      s,
      { type: 'pass', playerId: 'a', roundId: s.round!.id },
      s.round!.startedAt + 100,
    );
    expect(
      reduce(
        passed,
        { type: 'submit', playerId: 'a', roundId: s.round!.id, evidenceId: 'a' },
        ctx(s.round!.startedAt + 200),
      ).ok,
    ).toBe(false);
  });
  it('cannot turn a camera fallback into peer-controlled rating', () => {
    let s = live();
    s = act(
      s,
      { type: 'downgradeJudging', roundId: s.round!.id, reason: 'no baseline' },
      s.round!.startedAt + 100,
    );
    const result = tick(s, ctx(s.phaseEndsAt));
    expect(result.round!.outcome!.reason).toBe('verification-unavailable');
    expect(countsForRating({ ...result, phase: 'matchResult', endReason: 'target-reached' })).toBe(
      false,
    );
  });
  it('records a forfeit after verified play without deleting the losing contestant', () => {
    const s = verifiedRound();
    const ended = act(s, { type: 'leave', playerId: 'b' }, s.phaseEndsAt - 100);
    expect(ended.endReason).toBe('forfeit');
    expect(ended.winnerId).toBe('a');
    expect(ended.seats).toEqual(['a', 'b']);
    expect(ended.players.b!.connected).toBe(false);
    expect(countsForRating(ended)).toBe(true);
  });
  it('never awards rating for an empty match or a double disconnect', () => {
    const s = live();
    const ended = act(s, { type: 'leave', playerId: 'b' }, s.round!.startedAt + 100);
    expect(countsForRating(ended)).toBe(false);
    let both = act(
      verifiedRound(),
      { type: 'setConnected', playerId: 'a', connected: false },
      10000,
    );
    both = act(both, { type: 'setConnected', playerId: 'b', connected: false }, 10001);
    both = tick(both, ctx(both.pauseDeadline!));
    expect(both.endReason).toBe('abandoned');
    expect(countsForRating(both)).toBe(false);
  });
  it('shares one reconnect budget across repeated disconnects', () => {
    let s = verifiedRound();
    s = act(s, { type: 'setConnected', playerId: 'b', connected: false }, 10000);
    const grace = s.settings.disconnectGraceMs;
    s = act(s, { type: 'setConnected', playerId: 'b', connected: true }, 10000 + grace - 100);
    s = act(s, { type: 'setConnected', playerId: 'b', connected: false }, 10000 + grace);
    expect(s.pauseDeadline).toBe(10000 + grace + 100);
    const ended = tick(s, ctx(s.pauseDeadline!));
    expect(ended.endReason).toBe('forfeit');
    expect(ended.winnerId).toBe('a');
  });
});

it('does not revive a ranked match after the reconnect deadline, even before the next tick', () => {
  let s = verifiedRound();
  s = act(s, { type: 'setConnected', playerId: 'b', connected: false }, 10000);
  const ended = act(
    s,
    { type: 'setConnected', playerId: 'b', connected: true },
    s.pauseDeadline! + 1,
  );
  expect(ended.endReason).toBe('forfeit');
  expect(ended.winnerId).toBe('a');
});
