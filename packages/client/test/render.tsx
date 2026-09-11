import { act } from 'react';
import { createRoot } from 'react-dom/client';

// React requires this flag before it will let `act` drive updates.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The smallest possible hook harness: renders a hook into a detached root and
 * exposes its latest return value. Enough for hooks that have no UI of their
 * own, without pulling in a testing library.
 */
export function renderHook<T>(hook: () => T): { current: T } {
  const result = { current: undefined as T };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  function Probe() {
    result.current = hook();
    return null;
  }

  act(() => {
    root.render(<Probe />);
  });
  return result;
}
