import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
export function InfoDialog({
  kind,
  onClose,
}: {
  kind: 'rules' | 'privacy' | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (kind) ref.current?.showModal();
    else ref.current?.close();
  }, [kind]);
  return (
    <dialog ref={ref} className="info-dialog" onCancel={onClose} aria-labelledby="info-title">
      <button className="icon-button dialog-close" aria-label="Close" onClick={onClose}>
        <X />
      </button>
      <span className="eyebrow">THE SMALL PRINT, HUMAN-SIZED</span>
      <h2 id="info-title">{kind === 'rules' ? 'House rules.' : 'Your camera. Your control.'}</h2>
      {kind === 'rules' ? (
        <div className="prose">
          <p>
            First to three confirmed round wins takes the battle. A timed-out round awards no
            points. After 12 rounds, the higher score wins; equal scores draw.
          </p>
          <p>
            Hold your answer in the camera frame, then send a snapshot. Your opponent has 8 seconds
            to confirm or reject it. The first accepted snapshot by server receipt order wins.
            Earlier pending snapshots get their full review window.
          </p>
          <p>
            You get three snapshots per round. Expired or rejected snapshots can be tried again
            while time remains. Be fair: personal stories and creative answers need your judgment.
          </p>
          <p>
            Walk, never run. Stay in your room. Use small, safe objects and skip anything
            uncomfortable. Never show private information. Turn off your camera or leave whenever
            you need to stop.
          </p>
          <p>
            Each started battle, including rematches, counts for both players. Free players get
            three per UTC day. A disconnect or camera interruption pauses play for 30 seconds, then
            cancels. Returning players restart an interrupted round with a fresh countdown.
          </p>
        </div>
      ) : (
        <div className="prose">
          <p>
            Camera access starts only when you choose “Enable camera.” Your microphone is optional
            and starts muted. Leave the battle to stop all camera and microphone tracks.
          </p>
          <p>
            Live media travels directly to your opponent using WebRTC, or through a configured relay
            when needed. The app does not record it. Your opponent can still take a screenshot or
            record their screen, so play with someone you trust.
          </p>
          <p>
            Sending a snapshot shares that image with your opponent through our server. It stays in
            memory for the round, then is discarded. On-device color guidance does not send video to
            an AI service.
          </p>
          <p>
            A secure guest cookie identifies this browser for 30 days. We store battle usage and
            completed match summaries, including player names and scores, for up to 32 days. Avoid
            using your full name. Only your display-name preference is stored in local storage.
          </p>
          <p>
            There are no payments, advertising trackers, or automatic replay recordings in this
            version. Clearing your browser’s site data removes your guest identity from this device.
          </p>
        </div>
      )}
    </dialog>
  );
}
