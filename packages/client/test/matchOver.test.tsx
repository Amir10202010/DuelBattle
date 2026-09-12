// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { CHALLENGES, type MatchRewards, type PublicProfile } from '@battle/shared';
import { MatchOver } from '../src/screens/MatchOver.jsx';
import { MatchStore } from '../src/net/store.js';
import { outcome, publicMatch } from './fixtures.js';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SHOT = 'data:image/jpeg;base64,AAAA';
const PROMPT = CHALLENGES[0]!.prompt;

function render(props: Parameters<typeof MatchOver>[0]) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<MatchOver {...props} />));
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function props(over: Partial<Parameters<typeof MatchOver>[0]> = {}) {
  return {
    store: new MatchStore({
      on: () => {},
      connect: () => {},
      close: () => {},
      send: () => {},
      latencyMs: null,
      serverNow: () => Date.now(),
    }),
    match: publicMatch({ phase: 'matchResult', winnerId: 'p1', endReason: 'target-reached' }),
    youId: 'p1',
    evidence: {},
    standings: {},
    lastRatings: null,
    rewards: null,
    onLeave: () => {},
    onFindAnother: () => {},
    ...over,
  };
}

describe('the match recap', () => {
  it('shows the winning shot of each round', () => {
    const history = [
      outcome({ roundId: 'r1', roundNumber: 1, challengeId: CHALLENGES[0]!.id, winnerId: 'p1', reason: 'faster' }),
      outcome({ roundId: 'r2', roundNumber: 2, challengeId: CHALLENGES[1]!.id, winnerId: 'p2', reason: 'faster' }),
    ];
    const view = render(
      props({
        match: publicMatch({ phase: 'matchResult', winnerId: 'p1', history }),
        evidence: { 'r1:p1': SHOT, 'r2:p2': SHOT },
      }),
    );

    const shots = view.container.querySelectorAll('.filmstrip__shot');
    expect(shots).toHaveLength(2);
    expect(view.container.querySelector('.filmstrip__shot')?.className).toContain('is-yours');
    expect(view.container.querySelector('.filmstrip img')?.getAttribute('alt')).toContain(PROMPT);
    view.unmount();
  });

  it('leaves out rounds nobody won, and rounds whose shot it never saw', () => {
    const history = [
      outcome({ roundId: 'r1', winnerId: null, reason: 'both-failed' }),
      outcome({ roundId: 'r2', roundNumber: 2, winnerId: 'p2', reason: 'faster' }),
    ];
    const view = render(
      props({
        match: publicMatch({ phase: 'matchResult', history }),
        // Nothing for r2: the client joined late, or the copy fell off the end.
        evidence: {},
      }),
    );
    expect(view.container.querySelector('.filmstrip')).toBeNull();
    view.unmount();
  });

  it('names a round the players wrote themselves', () => {
    const custom = { id: 'c1', prompt: 'SHOW YOUR OLDEST MUG', authorId: 'p2' };
    const history = [outcome({ roundId: 'r1', challengeId: 'c1', winnerId: 'p2', reason: 'faster' })];
    const view = render(
      props({
        match: publicMatch({ phase: 'matchResult', history, customChallenges: [custom] }),
        evidence: { 'r1:p2': SHOT },
      }),
    );
    expect(view.container.querySelector('.filmstrip__prompt')?.textContent).toBe(
      'SHOW YOUR OLDEST MUG',
    );
    view.unmount();
  });

  it('shows nothing at all rather than an empty strip', () => {
    const view = render(props());
    expect(view.container.querySelector('.filmstrip')).toBeNull();
    view.unmount();
  });
});

describe('why you lost each round', () => {
  const row = (container: HTMLElement) =>
    container.querySelector('.recap__why')?.textContent ?? null;

  function withOutcome(over: Parameters<typeof outcome>[0]) {
    return render(
      props({ match: publicMatch({ phase: 'matchResult', history: [outcome(over)] }) }),
    );
  }

  it('says nothing accusatory about a round you won', () => {
    const view = withOutcome({ winnerId: 'p1', reason: 'faster' });
    expect(row(view.container)).toBe('won it');
    view.unmount();
  });

  it('says how much slower you were when you both had it', () => {
    const view = withOutcome({
      winnerId: 'p2',
      reason: 'faster',
      perPlayer: {
        p1: { valid: true, elapsedMs: 4_200, note: 'ok' },
        p2: { valid: true, elapsedMs: 3_000, note: 'ok' },
      },
    });
    expect(row(view.container)).toBe('1.2s slower');
    view.unmount();
  });

  /**
   * The one a player most needs to be able to see a pattern in: a peer round
   * lost because the opponent voted it down, every time.
   */
  it('says when your answer was voted down', () => {
    const view = withOutcome({
      judging: 'peer',
      winnerId: 'p2',
      reason: 'only-valid',
      perPlayer: { p1: { valid: false, elapsedMs: 2_000, note: 'Rejected by your opponent' } },
    });
    expect(row(view.container)).toBe('voted down');
    expect(view.container.querySelector('.recap__why')?.className).toContain('is-rejected');
    view.unmount();
  });

  it('tells passing apart from running out of time', () => {
    const passed = withOutcome({
      winnerId: 'p2',
      perPlayer: { p1: { valid: false, elapsedMs: null, note: 'Passed' } },
    });
    expect(row(passed.container)).toBe('passed');
    passed.unmount();

    const timedOut = withOutcome({
      winnerId: 'p2',
      perPlayer: { p1: { valid: false, elapsedMs: null, note: 'Ran out of time' } },
    });
    expect(row(timedOut.container)).toBe('out of time');
    timedOut.unmount();
  });

  it('says the camera did not see it when that is what happened', () => {
    const view = withOutcome({
      winnerId: 'p2',
      perPlayer: {
        p1: { valid: false, elapsedMs: 5_000, note: 'That does not read as red — try filling more of the frame.' },
      },
    });
    expect(row(view.container)).toBe('not detected');
    view.unmount();
  });
});

describe('what the match paid out', () => {
  const rewards = (over: Partial<MatchRewards> = {}): MatchRewards => ({
    xp: 128,
    levelBefore: 4,
    levelAfter: 4,
    unlocked: [],
    rankMove: null,
    ...over,
  });

  const card = (over: Partial<PublicProfile> = {}): PublicProfile => ({
    name: 'You',
    avatar: { shape: 0, color: 0 },
    rating: 1180,
    peakRating: 1180,
    matchesPlayed: 12,
    wins: 7,
    losses: 5,
    draws: 0,
    streak: 1,
    bestStreak: 3,
    xp: 900,
    achievements: [],
    ...over,
  });

  it('says nothing at all when the match counted for nothing', () => {
    const view = render(props({ rewards: null, standings: { p1: card() } }));
    expect(view.container.querySelector('.payout')).toBeNull();
    view.unmount();
  });

  it('shows the XP a match was worth', () => {
    const view = render(props({ rewards: rewards(), standings: { p1: card() } }));
    expect(view.container.querySelector('.payout__xp')?.textContent).toBe('+128');
    view.unmount();
  });

  it('announces a level only when one was crossed', () => {
    const flat = render(props({ rewards: rewards(), standings: { p1: card() } }));
    expect(flat.container.querySelector('.payout__level')).toBeNull();
    flat.unmount();

    const up = render(
      props({ rewards: rewards({ levelBefore: 4, levelAfter: 5 }), standings: { p1: card() } }),
    );
    expect(up.container.querySelector('.payout__level')?.textContent).toContain('5');
    up.unmount();
  });

  it('names every award the match unlocked', () => {
    const view = render(
      props({
        rewards: rewards({ unlocked: ['first-blood', 'quickdraw'] }),
        standings: { p1: card() },
      }),
    );
    const names = [...view.container.querySelectorAll('.payout__awardname')].map((n) => n.textContent);
    expect(names).toEqual(['First Blood', 'Quickdraw']);
    view.unmount();
  });

  it('ignores an award id it does not recognise rather than rendering a blank', () => {
    const view = render(
      props({ rewards: rewards({ unlocked: ['no-such-award'] }), standings: { p1: card() } }),
    );
    expect(view.container.querySelectorAll('.payout__award')).toHaveLength(0);
    view.unmount();
  });

  it('draws a demotion differently from a promotion', () => {
    const down = render(
      props({ rewards: rewards({ rankMove: 'demoted' }), standings: { p1: card() } }),
    );
    expect(down.container.querySelector('.payout__rank')?.className).toContain('is-demoted');
    expect(down.container.querySelector('.payout__rank')?.textContent).toContain('Dropped to');
    down.unmount();
  });
});

describe('the way out of a finished match', () => {
  it('offers a rematch while the opponent is still there', () => {
    const view = render(props());
    expect(view.container.textContent).toContain('Play again');
    expect(view.container.textContent).not.toContain('Find another opponent');
    view.unmount();
  });

  it('offers somebody else once they have gone', () => {
    const match = publicMatch({ phase: 'matchResult', winnerId: 'p1', endReason: 'target-reached' });
    const gone = {
      ...match,
      players: {
        ...match.players,
        p2: { ...match.players.p2!, connected: false },
      },
    };
    const view = render(props({ match: gone }));
    expect(view.container.textContent).toContain('Find another opponent');
    view.unmount();
  });
});
