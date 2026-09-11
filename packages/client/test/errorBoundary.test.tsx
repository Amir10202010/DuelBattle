// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from '../src/components/ErrorBoundary.jsx';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function render(node: React.ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  // React re-throws caught errors to the console; the test asserts on the DOM.
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  act(() => root.render(node));
  return {
    container,
    spy,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function Boom(): React.ReactNode {
  throw new Error('render exploded');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('error boundary', () => {
  it('stays out of the way when nothing is wrong', () => {
    const view = render(
      <ErrorBoundary>
        <p>the game</p>
      </ErrorBoundary>,
    );
    expect(view.container.textContent).toContain('the game');
    view.unmount();
  });

  it('shows a way out instead of a black page', () => {
    const view = render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(view.container.textContent).toContain('Something broke');
    expect(view.container.querySelector('button')?.textContent).toBe('Reload');
    view.unmount();
  });

  it('labels itself for assistive tech rather than being a silent div', () => {
    const view = render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    const dialog = view.container.querySelector('[role="alertdialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('aria-label')).toBe('Something broke');
    view.unmount();
  });

  it('reports the crash rather than swallowing it', () => {
    const view = render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(view.spy.mock.calls.some((call) => String(call[0]).includes('Battle crashed'))).toBe(true);
    view.unmount();
  });
});
