// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { PublicProfile } from '@battle/shared';
import { DuelActors } from '../src/components/battle/DuelActors.jsx';
import { outcome, publicMatch } from './fixtures.js';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const standings: Record<string, PublicProfile> = {};

function render(props: Parameters<typeof DuelActors>[0]) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<DuelActors {...props} />));
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

const roundWon = publicMatch({
  phase: 'roundResult',
  round: {
    id: 'r1',
    number: 1,
    challengeId: 'color-red',
    judging: 'auto',
    aiPending: false,
    startedAt: 0,
    submissions: {},
    outcome: outcome({ winnerId: 'p1', reason: 'better-answer' }),
  },
});

const matchWon = publicMatch({ phase: 'matchResult', winnerId: 'p1', endReason: 'target-reached' });

describe('the knockout', () => {
  it('plays a point as a band, with no full-screen takeover', () => {
    const view = render({ match: roundWon, youId: 'p1', standings, placement: 'round' });
    const scene = view.container.querySelector('.duel-actors');
    expect(scene?.className).toContain('duel-actors--round');
    expect(scene?.className).not.toContain('duel-actors--finish');
    // A point is worth "+1", not a paragraph.
    expect(view.container.querySelector('.point-pop')?.textContent).toBe('+1');
    expect(view.container.querySelector('.duel-actors__caption')).toBeNull();
    view.unmount();
  });

  it('plays the finisher full screen, and says who went down', () => {
    const view = render({ match: matchWon, youId: 'p1', standings, placement: 'match' });
    const scene = view.container.querySelector('.duel-actors');
    expect(scene?.className).toContain('duel-actors--match');
    expect(scene?.className).toContain('duel-actors--finish');
    expect(view.container.querySelector('.duel-actors__caption')?.textContent).toContain('Grace');
    view.unmount();
  });

  it('puts the winner on the side the viewer is sitting on', () => {
    const mine = render({ match: roundWon, youId: 'p1', standings, placement: 'round' });
    expect(mine.container.querySelector('.duel-actors')?.className).toContain('duel-actors--left');
    mine.unmount();

    // The same round, seen by the player who lost it: the blow comes the other way.
    const theirs = render({ match: roundWon, youId: 'p2', standings, placement: 'round' });
    expect(theirs.container.querySelector('.duel-actors')?.className).toContain('duel-actors--right');
    theirs.unmount();
  });

  it('shows nothing for the placement whose moment has not happened', () => {
    const early = render({ match: roundWon, youId: 'p1', standings, placement: 'match' });
    expect(early.container.querySelector('.duel-actors')).toBeNull();
    early.unmount();

    const drawn = render({
      match: publicMatch({ phase: 'matchResult', winnerId: null }),
      youId: 'p1',
      standings,
      placement: 'match',
    });
    expect(drawn.container.querySelector('.duel-actors')).toBeNull();
    drawn.unmount();
  });

  it('clears itself once the hit has landed', () => {
    vi.useFakeTimers();
    try {
      const view = render({ match: roundWon, youId: 'p1', standings, placement: 'round' });
      expect(view.container.querySelector('.duel-actors')).not.toBeNull();
      act(() => vi.advanceTimersByTime(2_500));
      expect(view.container.querySelector('.duel-actors')).toBeNull();
      view.unmount();
    } finally {
      vi.useRealTimers();
    }
  });
});
