import { tr, useUiPreferences } from '../i18n/index.js';
import { memo, useEffect, useRef, useState } from 'react';
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
  /**
   * Anything that has to line up with the picture, pixel for pixel.
   *
   * The camera window is the only element on the screen whose box is exactly
   * the field of view that gets photographed, so the tracking overlay lives
   * inside it rather than over the stage. That single move is what stopped the
   * skeleton from sitting an inch off the person it belongs to.
   */
  children?: React.ReactNode;
}

export const SelfVideo = memo(function SelfVideo({ videoRef, children }: SelfVideoProps) {
  useUiPreferences();
  const windowRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 320, height: 240 });
  useEffect(() => {
    const parent = windowRef.current?.parentElement;
    if (!parent) return;
    const resize = () => {
      const width = Math.max(parent.clientWidth, parent.clientHeight * 4 / 3);
      setSize({ width, height: width * 3 / 4 });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(parent); resize();
    return () => observer.disconnect();
  }, []);
  return (
    <div className="stage__camera-window" ref={windowRef} style={size}>
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
      {children}
    </div>
  );
});

interface PeerVideoProps {
  store: MatchStore;
  playerId: string | null;
}

/**
 * The opponent's camera, drawn from the relayed frame stream.
 *
 * Frames are decoded off the rendering path and painted onto a canvas, rather
 * than swapped into an `<img>` by assigning `src`. Assigning `src` hands the
 * browser a decode to do at paint time; at four frames a second nobody noticed,
 * and at fifteen it is a visible hitch on every frame. Decoding first and
 * painting a finished picture keeps the stream smooth, and an out-of-order
 * decode is dropped rather than shown, so the video never jumps backwards.
 *
 * This component renders once and then never again for the rest of the match:
 * frames never touch React state.
 */
export const PeerVideo = memo(function PeerVideo({ store, playerId }: PeerVideoProps) {
  useUiPreferences();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const staleTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!playerId) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d', { alpha: false });
    if (!canvas || !context) return;
    let stopped = false;
    let newest = 0;
    let issued = 0;

    const markLive = () => {
      canvas.dataset.live = 'true';
      if (staleTimer.current !== null) window.clearTimeout(staleTimer.current);
      // If frames stop, fade to the placeholder rather than freezing on a
      // stale picture that implies the opponent is still there.
      staleTimer.current = window.setTimeout(() => {
        if (canvasRef.current) canvasRef.current.dataset.live = 'false';
      }, 2_500);
    };

    const unsubscribe = store.onPeerFrame((image, from) => {
      if (from !== playerId || stopped) return;
      const ticket = ++issued;
      const picture = new Image();
      picture.decoding = 'async';
      picture.src = image;
      const paint = () => {
        // A frame that finished decoding after a newer one is already history.
        if (stopped || ticket <= newest || !picture.naturalWidth) return;
        newest = ticket;
        if (canvas.width !== picture.naturalWidth || canvas.height !== picture.naturalHeight) {
          canvas.width = picture.naturalWidth;
          canvas.height = picture.naturalHeight;
        }
        context.drawImage(picture, 0, 0);
        markLive();
      };
      picture.decode().then(paint, () => {
        // Safari has historically rejected decode() for images it will still
        // draw; one retry through the load event costs nothing.
        picture.onload = paint;
      });
    });

    return () => {
      stopped = true;
      unsubscribe();
      if (staleTimer.current !== null) window.clearTimeout(staleTimer.current);
    };
  }, [store, playerId]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="stage__video stage__peer"
        width={320}
        height={240}
        data-live="false"
        aria-hidden="true"
      />
      <div className="stage__placeholder" aria-hidden="true">
        <span className="eyebrow">{tr('no signal')}</span>
      </div>
    </>
  );
});
