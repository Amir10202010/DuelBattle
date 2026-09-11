// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { CHALLENGES, type RoundOutcome } from '@battle/shared';
import { announcementFor } from '../src/components/Announcer.jsx';
import { outcome, publicMatch } from './fixtures.js';

const AUTO = CHALLENGES.find((c) => c.judging === 'auto')!;
const PEER = CHALLENGES.find((c) => c.judging === 'peer')!;

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
    const said = announcementFor(publicMatch({ players: { p1: publicMatch().players.p1! } }), 'p1');
    expect(said).toContain('A B 1 2 C');
  });

  it('says when the opponent arrives', () => {
    expect(announcementFor(publicMatch(), 'p1')).toContain('Grace is here');
  });

  it('reads the prompt and who decides it', () => {
    const auto = announcementFor(publicMatch({ phase: 'challenge', round: round(AUTO.id) }), 'p1');
    expect(auto).toContain(AUTO.prompt);
    expect(auto).toContain('camera decides');

    const peer = announcementFor(publicMatch({ phase: 'challenge', round: round(PEER.id) }), 'p1');
    expect(peer).toContain('opponent decides');
  });

  it('never doubles the punctuation a reason already carries', () => {
    const won = outcome({
      challengeId: AUTO.id,
      winnerId: 'p1',
      reason: 'only-valid',
      perPlayer: { p1: { valid: true, elapsedMs: 900, note: 'That is the whole screen. Counted.' } },
    });
    const said = announcementFor(
      publicMatch({ phase: 'roundResult', round: round(AUTO.id, won) }),
      'p1',
    );
    expect(said).not.toMatch(/\.\./);
    expect(said).toContain('You won the round');
    expect(said).toContain('Score 0 to 0');
  });

  it('names the winner from the listener’s point of view', () => {
    const theirs = outcome({ challengeId: AUTO.id, winnerId: 'p2', reason: 'only-valid' });
    const forLoser = announcementFor(publicMatch({ phase: 'roundResult', round: round(AUTO.id, theirs) }), 'p1');
    const forWinner = announcementFor(publicMatch({ phase: 'roundResult', round: round(AUTO.id, theirs) }), 'p2');
    expect(forLoser).toContain('Grace won the round');
    expect(forWinner).toContain('You won the round');
  });

  it('calls a scoreless round a draw rather than silence', () => {
    const drawn = outcome({ challengeId: AUTO.id, reason: 'both-failed' });
    expect(
      announcementFor(publicMatch({ phase: 'roundResult', round: round(AUTO.id, drawn) }), 'p1'),
    ).toContain('Nobody scored');
  });

  it('reports the end of the match, including an abandoned one', () => {
    expect(
      announcementFor(publicMatch({ phase: 'matchResult', winnerId: 'p1', endReason: 'target-reached' }), 'p1'),
    ).toContain('You win the match');
    expect(
      announcementFor(publicMatch({ phase: 'matchResult', endReason: 'abandoned' }), 'p1'),
    ).toContain('abandoned');
  });
});
