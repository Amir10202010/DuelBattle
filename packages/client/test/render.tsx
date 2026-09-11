import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// React requires this flag before it will let `act` drive updates.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export interface HookHandle<T> {
  current: T;
  /** Runs an imperative call from the hook and settles everything it triggers. */
  run(fn: () => void): Promise<void>;
  /** Same, for something that has to be awaited — advancing fake timers, say. */
  runAsync(fn: () => Promise<unknown>): Promise<void>;
  /** Settles pending effects and microtasks without doing anything else. */
  flush(): Promise<void>;
  unmount(): void;
}

/**
 * The smallest possible hook harness: renders a hook into a detached root and
 * exposes its latest return value. Enough for hooks that have no UI of their
 * own, without pulling in a testing library.
 */
export function renderHook<T>(hook: () => T): HookHandle<T> {
  const handle = { current: undefined as T } as HookHandle<T>;
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root: Root;

  function Probe() {
    handle.current = hook();
    return null;
  }

  act(() => {
    root = createRoot(container);
    root.render(<Probe />);
  });

  const settle = async (fn?: () => void) => {
    await act(async () => {
      fn?.();
      // Two turns: one for the promise the call made, one for the state update
      // its resolution schedules.
      await Promise.resolve();
      await Promise.resolve();
    });
  };
  handle.run = (fn: () => void) => settle(fn);
  handle.runAsync = async (fn: () => Promise<unknown>) => {
    await act(async () => {
      await fn();
      await Promise.resolve();
    });
  };
  handle.flush = () => settle();
  handle.unmount = () => {
    act(() => root.unmount());
    container.remove();
  };
  return handle;
}
