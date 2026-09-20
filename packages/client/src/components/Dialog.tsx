import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { tr, useUiPreferences } from '../i18n/index.js';

/**
 * The detail popup.
 *
 * Cards in a collection should show the thing, not a paragraph about it. The
 * numbers — how far along you are, what it pays, what the rank range is — go
 * here, one tap away, so twenty of them on a screen stay readable.
 *
 * Built on the native dialog element: it traps focus, closes on Escape and
 * hides the rest of the page from assistive tech without any of that being
 * reimplemented here.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  className = '',
}: {
  open: boolean;
  onClose: () => void;
  /** Read out when the dialog opens. */
  title: string;
  children: ReactNode;
  className?: string;
}) {
  useUiPreferences();
  const ref = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`sheet ${className}`}
      aria-label={title}
      onClose={onClose}
      onCancel={onClose}
      // Clicking the backdrop lands on the dialog itself, never on its content.
      onClick={(event) => event.target === ref.current && onClose()}
    >
      <div className="sheet__inner">
        <button className="sheet__close" onClick={onClose} aria-label={tr('Close')}>
          <X size={18} />
        </button>
        {children}
      </div>
    </dialog>
  );
}
