import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Shuffle, Users, X } from 'lucide-react';
import { parsePlayerName } from '../../shared/identity';
import { getName } from '../lib/client';

export function NameDialog({
  open,
  onClose,
  onSubmit,
  busy,
  error,
  connected,
  onRetry,
  judgeMode,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (name: string, mode: 'private' | 'random') => void;
  judgeMode?: 'ai' | 'peer';
  busy: boolean;
  error: string | null;
  connected: boolean;
  onRetry: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(getName);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [mode, setMode] = useState<'private' | 'random'>('private');
  useEffect(() => {
    if (open) ref.current?.showModal();
    else ref.current?.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="name-dialog"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current && !busy) onClose();
      }}
      aria-labelledby="name-title"
    >
      <button
        className="icon-button dialog-close"
        aria-label="Close"
        onClick={onClose}
        disabled={busy}
      >
        <X />
      </button>
      <span className="eyebrow">YOUR ARENA AWAITS</span>
      <h2 id="name-title">
        Make a name
        <br />
        for yourself.
      </h2>
      <p>Pick your name. Choose who you want to challenge.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = parsePlayerName(name);
          if (!parsed.success) setInvalid('Use 1–20 letters, numbers, spaces, or a dash.');
          else {
            setInvalid(null);
            onSubmit(parsed.data, mode);
          }
        }}
      >
        <fieldset className="battle-options" disabled={busy}>
          <legend>Your opponent</legend>
          <label className={mode === 'random' ? 'selected' : ''}>
            <input
              type="radio"
              name="battle-mode"
              value="random"
              checked={mode === 'random'}
              onChange={() => setMode('random')}
            />
            <Shuffle size={21} />
            <span>
              <strong>Random opponent</strong>
              <small>Match with someone searching now</small>
            </span>
          </label>
          <label className={mode === 'private' ? 'selected' : ''}>
            <input
              type="radio"
              name="battle-mode"
              value="private"
              checked={mode === 'private'}
              onChange={() => setMode('private')}
            />
            <Users size={21} />
            <span>
              <strong>Play with a friend</strong>
              <small>Private room with an invite link</small>
            </span>
          </label>
        </fieldset>
        <label htmlFor="player-name">Your player name</label>
        <input
          autoFocus
          id="player-name"
          value={name}
          maxLength={20}
          placeholder="e.g. Alex"
          autoComplete="nickname"
          onChange={(e) => setName(e.target.value)}
          aria-describedby={invalid || error ? 'name-error' : undefined}
        />
        <p className="judge-mode-note">
          {judgeMode === 'ai'
            ? 'AI judge on · Your submitted photo and up to two earlier frames go to Google Gemini for recognition and comparison. Best answer wins.'
            : judgeMode === 'peer'
              ? 'AI judge is not connected yet. These battles use opponent review.'
              : 'Checking the available judge…'}
        </p>
        {(invalid || error) && (
          <p className="form-error" role="alert" id="name-error">
            {invalid || error}
          </p>
        )}
        <button
          className="button button-dark full-width"
          disabled={busy || !connected}
          type="submit"
        >
          {busy
            ? 'Opening your arena…'
            : !connected
              ? 'Connecting…'
              : mode === 'random'
                ? 'Find opponent'
                : 'Create Battle'}
          {!busy && connected && <ArrowUpRight size={20} />}
        </button>
        {!connected && error && (
          <button className="text-link" type="button" onClick={onRetry}>
            Retry connection
          </button>
        )}
      </form>
      <span className="dialog-footnote">No account. No download. Just a friendly rivalry.</span>
    </dialog>
  );
}
