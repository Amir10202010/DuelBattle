import { Check, Hourglass, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { Attempt, RoomSnapshot } from '../../shared/protocol';

export function ReviewPanel({
  room,
  userId,
  now,
  busy,
  onReview,
}: {
  room: RoomSnapshot;
  userId: string;
  now: number;
  busy: boolean;
  onReview: (attempt: Attempt, accept: boolean) => void;
}) {
  const round = room.round;
  const panelRef = useRef<HTMLElement>(null);
  const pending =
    room.state === 'CHALLENGE_ACTIVE'
      ? round?.attempts.find((a) => a.playerId !== userId && a.status === 'pending')
      : undefined;
  const attemptId = pending?.id;
  useEffect(() => {
    if (attemptId)
      panelRef.current?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'instant'
          : 'smooth',
        block: 'nearest',
      });
  }, [attemptId]);
  if (!round || room.state !== 'CHALLENGE_ACTIVE') return null;
  const mine = round.attempts.filter((a) => a.playerId === userId).at(-1);
  return (
    <div className="review-area">
      {mine && (
        <div className={`attempt-status attempt-${mine.status}`} role="status">
          {mine.status === 'pending' || mine.status === 'accepted' ? (
            <Hourglass size={18} />
          ) : (
            <X size={18} />
          )}
          <span>
            {mine.status === 'pending'
              ? 'Snapshot sent. Your friend is the judge.'
              : mine.status === 'accepted'
                ? 'Confirmed. Waiting for an earlier snapshot to be reviewed.'
                : mine.status === 'expired'
                  ? 'Your review timed out. Try another snapshot while there’s time.'
                  : 'Not quite! Your friend rejected that snapshot. You can try again.'}
          </span>
        </div>
      )}
      {pending && (
        <section ref={panelRef} className="review-panel" aria-labelledby="review-title">
          <img
            src={pending.image}
            alt="Your opponent’s submitted challenge evidence"
            width="240"
            height="180"
          />
          <div className="review-copy">
            <span className="eyebrow">
              YOUR FRIEND’S SNAPSHOT · {Math.max(0, Math.ceil((pending.expiresAt - now) / 1000))}s
              TO REVIEW
            </span>
            <h2 id="review-title">Did they do it?</h2>
            <p>
              {round.challenge.subjective
                ? 'This one needs your judgment. Be a good sport.'
                : 'Check that they are holding or doing the thing. Background objects don’t count.'}
            </p>
            <div className="review-actions">
              <button
                className="button button-lime button-small"
                disabled={busy || now >= pending.expiresAt}
                onClick={() => onReview(pending, true)}
              >
                <Check size={18} /> Yes, that counts
              </button>
              <button
                className="button button-outline-light button-small"
                disabled={busy || now >= pending.expiresAt}
                onClick={() => onReview(pending, false)}
              >
                <X size={17} /> Not quite
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
