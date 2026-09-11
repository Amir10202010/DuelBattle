// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { titleForTesting as titleFor } from '../src/hooks/useDocumentTitle.js';
import { player, publicMatch, submission } from './fixtures.js';

const alone = publicMatch({ seats: ['p1', null], players: { p1: player({ id: 'p1', name: 'Ada' }) } });

describe('what the tab should say', () => {
  it('says nothing before you are in a room', () => {
    expect(titleFor(null, 'p1')).toBeNull();
    expect(titleFor(publicMatch(), null)).toBeNull();
  });

  it('says who you are waiting for, and the code to send them', () => {
    expect(titleFor(alone, 'p1')).toContain(alone.roomCode);
  });

  /** The moment someone leaves the tab open for. */
  it('says when your opponent has arrived', () => {
    expect(titleFor(publicMatch(), 'p1')).toBe('Grace is here');
  });

  it('says when they are ready and waiting on you', () => {
    const ready = publicMatch({
      players: {
        p1: player({ id: 'p1', name: 'Ada' }),
        p2: player({ id: 'p2', name: 'Grace', seat: 1, ready: true }),
      },
    });
    expect(titleFor(ready, 'p1')).toBe('Grace is ready');
  });

  it('says nothing during a round, because you are looking at it', () => {
    expect(titleFor(publicMatch({ phase: 'challenge' }), 'p1')).toBeNull();
    expect(titleFor(publicMatch({ phase: 'countdown' }), 'p1')).toBeNull();
    expect(titleFor(publicMatch({ phase: 'roundResult' }), 'p1')).toBeNull();
  });

  it('calls you back when a verdict is waiting on you', () => {
    const judging = publicMatch({
      phase: 'judging',
      round: {
        id: 'r1',
        number: 1,
        challengeId: 'obj-face',
        judging: 'peer',
        aiPending: false,
        startedAt: 0,
        outcome: null,
        submissions: { p2: submission({ playerId: 'p2' }) },
      },
    });
    expect(titleFor(judging, 'p1')).toBe('Your verdict');
  });

  it('stops asking once you have voted', () => {
    const voted = publicMatch({
      phase: 'judging',
      round: {
        id: 'r1',
        number: 1,
        challengeId: 'obj-face',
        judging: 'peer',
        aiPending: false,
        startedAt: 0,
        outcome: null,
        submissions: {
          p2: submission({
            playerId: 'p2',
            needsVerdict: false,
            peer: { approve: true, voterId: 'p1' },
          }),
        },
      },
    });
    expect(titleFor(voted, 'p1')).toBeNull();
  });

  it('says when they are waiting on you for a rematch', () => {
    const over = publicMatch({
      phase: 'matchResult',
      players: {
        p1: player({ id: 'p1', name: 'Ada' }),
        p2: player({ id: 'p2', name: 'Grace', seat: 1, rematchVote: true }),
      },
    });
    expect(titleFor(over, 'p1')).toBe('Grace wants a rematch');
  });
});
