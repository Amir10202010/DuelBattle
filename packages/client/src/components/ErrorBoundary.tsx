import { tr } from '../i18n/index.js';
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * The last line of defence.
 *
 * A render error anywhere under here would otherwise unmount the whole tree and
 * leave a black page — and because the camera lives in a hook above the crash,
 * the light would stay on with nothing on screen to explain why. This at least
 * says something happened and offers the one action that reliably fixes it.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Nothing collects this yet; when something does, this is where it goes.
    // eslint-disable-next-line no-console -- a crash is exactly when the console earns its place
    console.error('Battle crashed', error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <div className="overlay overlay--fatal" role="alertdialog" aria-label={tr('Something broke')}>
        <div className="overlay__inner">
          <p className="eyebrow">{tr('Something broke')}</p>
          <h2 className="display overlay__title">{tr('That is on us.')}</h2>
          <p className="dim">
            {tr(
              'The game hit an error it could not recover from. Reloading should put you back in — your seat is held for a minute.',
            )}
          </p>
          <button className="btn btn--primary btn--lg" onClick={() => location.reload()}>
            {tr('Reload')}
          </button>
        </div>
      </div>
    );
  }
}
