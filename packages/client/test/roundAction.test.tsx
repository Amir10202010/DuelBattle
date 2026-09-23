// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRoundAction } from '../src/hooks/useRoundAction.js';
import { createEvidenceCapture } from '../src/media/capture.js';
import type { MatchStore } from '../src/net/store.js';
import { publicMatch, player } from './fixtures.js';

vi.mock('../src/media/capture.js', () => ({ EVIDENCE_QUALITY: .78, createEvidenceCapture: vi.fn() }));
vi.mock('../src/media/sound.js', () => ({ sound: { play: vi.fn() } }));
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const capture = vi.fn((): string | null => 'data:image/jpeg;base64,AAAA');
let cleanup = () => {};
beforeEach(() => {
  vi.useFakeTimers(); capture.mockReset().mockReturnValue('data:image/jpeg;base64,AAAA');
  vi.mocked(createEvidenceCapture).mockReturnValue({ toBoundedDataUrl: capture } as unknown as ReturnType<typeof createEvidenceCapture>);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });
function setup(patch: Partial<Parameters<typeof useRoundAction>[0]> = {}) {
  const submit = vi.fn(); const pass = vi.fn();
  let props: Parameters<typeof useRoundAction>[0] = {
    match: publicMatch({ phase: 'challenge', phaseEndsAt: Date.now() + 30_000,
      round: { id: 'r1', number: 1, challengeId: 'color-red', judging: 'auto', aiPending: false, startedAt: Date.now(), submissions: {}, outcome: null } }),
    youId: 'p1', connected: true,
    camera: { status: 'ready', message: null, videoRef: { current: document.createElement('video') }, devices: [], deviceId: null, request: vi.fn(), stop: vi.fn(), selectDevice: vi.fn() },
    store: { submit, pass, serverNow: () => Date.now() } as unknown as MatchStore,
    ...patch,
  };
  let action!: ReturnType<typeof useRoundAction>;
  function Test() { action = useRoundAction(props); return null; }
  const container = document.createElement('div'); document.body.appendChild(container);
  const root = createRoot(container);
  const render = () => act(() => root.render(<Test />));
  render();
  cleanup = () => { act(() => root.unmount()); container.remove(); };
  return { get action() { return action; }, get props() { return props; }, submit, pass,
    update(patch: Partial<typeof props>) { props = { ...props, ...patch }; render(); } };
}
describe('round input transaction', () => {
  it('captures once across a rapid double tap and a competing pass', () => {
    const view = setup();
    act(() => { view.action.snap(); view.action.snap(); view.action.pass(); });
    expect(view.submit).toHaveBeenCalledTimes(1); expect(view.pass).not.toHaveBeenCalled();
    expect(view.action.pending).toBe('snap'); expect(view.action.image).toContain('data:image/jpeg');
    expect(view.action.canSnap).toBe(false);
  });
  it('keeps pass pending until the server acknowledges it', () => {
    const view = setup();
    act(() => { view.action.pass(); view.action.snap(); });
    expect(view.pass).toHaveBeenCalledTimes(1); expect(view.submit).not.toHaveBeenCalled();
    view.update({ match: { ...view.props.match, players: { ...view.props.match.players, p1: player({ id: 'p1', passed: true }) } } });
    expect(view.action.pending).toBeNull(); expect(view.action.canSnap).toBe(false);
  });
  it('retains the captured image when the server accepts the answer', () => {
    const view = setup(); act(() => view.action.snap());
    view.update({ match: { ...view.props.match, players: { ...view.props.match.players, p1: player({ id: 'p1', submitted: true }) } } });
    expect(view.action.pending).toBeNull(); expect(view.action.image).toContain('data:image/jpeg');
    act(() => vi.advanceTimersByTime(5000)); expect(view.action.error).toBeNull();
  });
  it('reports capture failure and allows a fresh attempt', () => {
    const view = setup(); capture.mockReturnValueOnce(null);
    act(() => view.action.snap());
    expect(view.submit).not.toHaveBeenCalled(); expect(view.action.error).toContain('Could not capture');
    expect(view.action.canSnap).toBe(true);
    act(() => view.action.snap()); expect(view.submit).toHaveBeenCalledTimes(1);
  });
  it('recovers a missing acknowledgement without claiming success', () => {
    const view = setup(); act(() => view.action.snap());
    act(() => vi.advanceTimersByTime(2500));
    expect(view.action.error).toContain('No confirmation'); expect(view.action.image).toBeNull();
    act(() => view.action.snap()); expect(view.submit).toHaveBeenCalledTimes(2);
  });
  it('cannot submit while reconnecting, paused or after the authoritative deadline', () => {
    const view = setup({ connected: false }); act(() => view.action.snap());
    expect(view.submit).not.toHaveBeenCalled();
    view.update({ connected: true, match: { ...view.props.match, paused: { since: Date.now(), deadline: Date.now() + 45000 } } });
    act(() => view.action.snap()); expect(view.submit).not.toHaveBeenCalled();
    view.update({ match: { ...view.props.match, paused: null, phaseEndsAt: Date.now() - 1 } });
    act(() => { view.action.snap(); view.action.pass(); });
    expect(view.submit).not.toHaveBeenCalled(); expect(view.pass).not.toHaveBeenCalled();
  });
  it('resets pending work and its timeout at a new round', () => {
    const view = setup(); act(() => view.action.snap());
    view.update({ match: { ...view.props.match, round: { ...view.props.match.round!, id: 'r2' } } });
    act(() => vi.advanceTimersByTime(2500));
    expect(view.action.error).toBeNull(); expect(view.action.image).toBeNull();
    act(() => view.action.snap()); expect(view.submit.mock.calls.at(-1)?.[0]).toBe('r2');
  });
  it('does not hijack links, editable content, repeated keys or open dialogs', () => {
    const view = setup();
    const link = document.createElement('a'); link.href = '#'; document.body.appendChild(link);
    act(() => link.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    const editor = document.createElement('div'); editor.setAttribute('contenteditable', 'true'); document.body.appendChild(editor);
    act(() => editor.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })));
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', repeat: true })));
    const dialog = document.createElement('dialog'); dialog.setAttribute('open', ''); document.body.appendChild(dialog);
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' })));
    expect(view.submit).not.toHaveBeenCalled();
    link.remove(); editor.remove(); dialog.remove();
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' })));
    expect(view.submit).toHaveBeenCalledTimes(1);
  });
});
