// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ScoreStrip } from '../src/components/Hud.jsx';
import { outcome, player, publicMatch } from './fixtures.js';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function render(props: Parameters<typeof ScoreStrip>[0]) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<ScoreStrip {...props} />));
  return {
    side: (seat: 0 | 1) =>
      container.querySelector(`.scorestrip__side--seat${seat}`) as HTMLElement | null,
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function scored(a: number, b: number, over: Partial<Parameters<typeof publicMatch>[0]> = {}) {
  return publicMatch({
    players: {
      p1: player({ id: 'p1', name: 'Ada', seat: 0, score: a }),
      p2: player({ id: 'p2', name: 'Grace', seat: 1, score: b }),
    },
    ...over,
  });
}

describe('the scoreboard', () => {
  it('shows both scores and the target once, between them', () => {
    const view = render({ match: scored(2, 1), youId: 'p1' });
    expect(view.side(0)?.querySelector('.scorestrip__score')?.textContent).toBe('2');
    expect(view.side(1)?.querySelector('.scorestrip__score')?.textContent).toBe('1');
    expect(view.container.querySelectorAll('.scorestrip__target')).toHaveLength(1);
    expect(view.container.querySelector('.scorestrip__target b')?.textContent).toBe('3');
    view.unmount();
  });

  it('draws one segment per round needed, filled by rounds won', () => {
    const view = render({ match: scored(2, 0), youId: 'p1' });
    const pips = view.side(0)!.querySelectorAll('.scorestrip__pips i');
    expect(pips).toHaveLength(3);
    expect([...pips].filter((p) => p.classList.contains('is-won'))).toHaveLength(2);
    view.unmount();
  });

  it('marks the side that is ahead, and neither when level', () => {
    const ahead = render({ match: scored(2, 1), youId: 'p1' });
    expect(ahead.side(0)?.className).toContain('is-lead');
    expect(ahead.side(1)?.className).not.toContain('is-lead');
    ahead.unmount();

    const level = render({ match: scored(1, 1), youId: 'p1' });
    expect(level.side(0)?.className).not.toContain('is-lead');
    expect(level.side(1)?.className).not.toContain('is-lead');
    level.unmount();
  });

  it('flags match point for whoever is one round from winning', () => {
    const view = render({ match: scored(2, 2), youId: 'p1' });
    expect(view.side(0)?.className).toContain('is-matchpoint');
    expect(view.side(1)?.className).toContain('is-matchpoint');
    view.unmount();

    // Two of three, on a first-to-five match, is nowhere near the end.
    const long = render({
      match: scored(2, 0, { settings: { ...publicMatch().settings, winTarget: 5 } }),
      youId: 'p1',
    });
    expect(long.side(0)?.className).not.toContain('is-matchpoint');
    long.unmount();
  });

  it('flares only the side that just took the round, and only while it is shown', () => {
    const won = render({
      match: scored(1, 0, {
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
      }),
      youId: 'p1',
    });
    expect(won.side(0)?.className).toContain('is-scoring');
    expect(won.side(1)?.className).not.toContain('is-scoring');
    expect(won.side(0)?.querySelector('.scorestrip__pips i.is-earned')).not.toBeNull();
    won.unmount();

    const during = render({ match: scored(1, 0, { phase: 'challenge' }), youId: 'p1' });
    expect(during.side(0)?.className).not.toContain('is-scoring');
    during.unmount();
  });

  it('names an empty seat without inventing a score for it', () => {
    const view = render({
      match: publicMatch({
        seats: ['p1', null],
        players: { p1: player({ id: 'p1', name: 'Ada', seat: 0, score: 1 }) },
      }),
      youId: 'p1',
    });
    expect(view.side(1)?.querySelector('.scorestrip__name')?.textContent).toBe('—');
    expect(view.side(1)?.querySelector('.scorestrip__score')?.textContent).toBe('0');
    view.unmount();
  });
});
