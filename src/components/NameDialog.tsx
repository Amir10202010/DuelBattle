import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, X } from 'lucide-react';
import { nameSchema } from '../../shared/protocol';
import { getName } from '../lib/client';

export function NameDialog({
  open,
  onClose,
  onSubmit,
  busy,
  error,
  connected,
  onRetry,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
  busy: boolean;
  error: string | null;
  connected: boolean;
  onRetry: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(getName);
  const [invalid, setInvalid] = useState<string | null>(null);
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
      <p>Pick a name your friend will recognize.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = nameSchema.safeParse(name);
          if (!parsed.success) setInvalid('Use 1–20 letters, numbers, spaces, or a dash.');
          else {
            setInvalid(null);
            onSubmit(parsed.data);
          }
        }}
      >
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
          {busy ? 'Opening your arena…' : !connected ? 'Connecting…' : 'Create Battle'}
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
