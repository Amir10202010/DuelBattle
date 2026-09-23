// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { xpToReach, type PublicProfile } from '@battle/shared';
import { NextMilestone } from '../src/components/home/NextMilestone.jsx';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
function render(matchesPlayed: number, xp = 0) {
  const profile = { name: 'Nova', matchesPlayed, rating: 1080, xp } as PublicProfile;
  const element = document.createElement('div'); const root = createRoot(element);
  act(() => root.render(<NextMilestone profile={profile} onNavigate={() => {}} />));
  const content = element.textContent;
  const path = element.querySelector('[role="progressbar"]');
  const value = path?.getAttribute('aria-valuenow');
  act(() => root.unmount());
  return { content, value };
}
describe('home progression', () => {
  it('shows placement count before a player earns a public rank', () => {
    const view = render(3);
    expect(view.content).toContain('3 of 5 placements complete');
    expect(view.value).toBe('3');
    expect(view.content).not.toContain('rating to go');
  });
  it('uses the real free cosmetic threshold', () => {
    const view = render(3, 224);
    expect(view.content).toContain('Stardust');
    expect(view.content).toContain(`${xpToReach(3) - 224} XP to go`);
  });
  it('switches from placement to rating progress and completed unlocks to XP', () => {
    const view = render(5, xpToReach(3));
    expect(view.content).toContain('rating to go');
    expect(view.content).not.toContain('placements complete');
    expect(view.content).toContain('Level 4');
    expect(view.content).not.toContain('Stardust');
  });
});
