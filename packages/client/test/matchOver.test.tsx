// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { CHALLENGES } from '@battle/shared';
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
    onLeave: () => {},
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
