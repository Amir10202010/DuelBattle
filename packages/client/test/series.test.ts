// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { seriesLine } from '../src/components/Series.jsx';
import { publicMatch } from './fixtures.js';

function state(
  series: Record<string, number>,
  seats: [string | null, string | null] = ['p1', 'p2'],
) {
  return publicMatch({ phase: 'matchResult', seats, series });
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
