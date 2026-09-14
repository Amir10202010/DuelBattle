import { tr, useUiPreferences } from '../i18n/index.js';
import { memo, useEffect, useRef } from 'react';
import type { PublicPlayer } from '@battle/shared';
import type { MatchStore } from '../net/store.js';

export type Seat = 0 | 1;

interface StageFrameProps {
  seat: Seat;
  player: PublicPlayer | null;
  /** Rendered over the video: badges, detection ring, lock-in state. */
  overlay?: React.ReactNode;
  /** Rendered under the name row. */
  footer?: React.ReactNode;
  children: React.ReactNode;
  state?: 'idle' | 'live' | 'locked' | 'won' | 'lost';
}

/**
 * The chrome around one player's video: name, seat colour, status. Both stages
 * are identical in size and treatment — this is a duel, so neither side gets a
 * visual advantage.
 */
export function StageFrame({
  seat,
  player,
  overlay,
  footer,
  children,
  state = 'idle',
}: StageFrameProps) {
  useUiPreferences();
  return (
    <section className={`stage stage--seat${seat} stage--${state}`}>
      <div className="stage__media">
        {children}
        {overlay}
      </div>
      <header className="stage__bar">
        <span className="stage__dot" aria-hidden="true" />
        <span className="stage__name">{player?.name ?? tr('Waiting…')}</span>
        {player && !player.connected && (
          <span className="stage__status">{tr('reconnecting…')}</span>
        )}
        {footer}
      </header>
    </section>
  );
}

interface SelfVideoProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

export const SelfVideo = memo(function SelfVideo({ videoRef }: SelfVideoProps) {
  useUiPreferences();
  return (
    <video
      ref={videoRef}
      className="stage__video stage__video--mirrored"
      playsInline
      muted
      autoPlay
      // The element is decorative: every state it can be in is described in text
      // elsewhere on the screen.
      aria-hidden="true"
    />
  );
});

interface PeerVideoProps {
  store: MatchStore;
  playerId: string | null;
}

/**
 * The opponent's camera, drawn from the relayed frame stream.
 *
 * Frames arrive several times a second, so they are written straight onto the
 * image element rather than through React state — this component renders once
 * and then never again for the rest of the match.
 */
export const PeerVideo = memo(function PeerVideo({ store, playerId }: PeerVideoProps) {
  useUiPreferences();
  const imgRef = useRef<HTMLImageElement | null>(null);
  const staleTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!playerId) return;
    const markLive = () => {
      const el = imgRef.current;
      if (!el) return;
      el.dataset.live = 'true';
      if (staleTimer.current !== null) window.clearTimeout(staleTimer.current);
      // If frames stop, fade to the placeholder rather than freezing on a
      // stale picture that implies the opponent is still there.
      staleTimer.current = window.setTimeout(() => {
        if (imgRef.current) imgRef.current.dataset.live = 'false';
      }, 2_500);
    };

    const unsubscribe = store.onPeerFrame((image, from) => {
      if (from !== playerId || !imgRef.current) return;
      imgRef.current.src = image;
      markLive();
    });

    return () => {
      unsubscribe();
      if (staleTimer.current !== null) window.clearTimeout(staleTimer.current);
    };
  }, [store, playerId]);

  return (
    <>
      <img ref={imgRef} className="stage__video stage__peer" alt={''} data-live="false" />
      <div className="stage__placeholder" aria-hidden="true">
        <span className="eyebrow">{tr('no signal')}</span>
      </div>
    </>
  );
});
