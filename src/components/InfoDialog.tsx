import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
export function InfoDialog({
  kind,
  onClose,
  judgeMode,
}: {
  kind: 'rules' | 'privacy' | null;
  onClose: () => void;
  judgeMode?: 'ai' | 'peer';
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
          {judgeMode === 'ai' ? (
            <p>
              Submit one photo per round. The AI compares both photos after both players submit or
              the timer ends. Visible fulfillment earns up to 70 points, presentation up to 30. Only
              a confirmed answer can win. Scores within 3 points draw. An AI outage awards no
              points.
            </p>
          ) : (
            <p>
              Hold your answer in the camera frame, then send a snapshot. Your opponent has 8
              seconds to confirm or reject it. The first accepted snapshot by server receipt order
              wins. Earlier pending snapshots get their full review window.
            </p>
          )}
          {judgeMode !== 'ai' && (
            <p>
              You get three snapshots per round. Expired or rejected snapshots can be tried again
              while time remains. Be fair: personal stories and creative answers need your judgment.
            </p>
          )}
          <p>
            Choose Random opponent to enter the live queue, or Play with a friend to share a private
            invite. Searching does not consume a battle. You can cancel at any time before the
            battle starts.
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
            Sending a snapshot sends that photo and up to two earlier camera frames to our server.
            In AI mode these images also go to Google Gemini for object recognition and comparison.
            Google’s API data policies apply; free-tier submissions may be used to improve Google’s
            products. In opponent review mode no images are sent to an AI service. Submitted photos
            are shown to your opponent and discarded from our memory after the verdict. Color
            guidance runs on-device.
          </p>
          <p>
            A secure guest cookie identifies this browser for 30 days. We store battle usage and
            completed match summaries, including player names, scores and AI assessments, for up to
            32 days. Avoid using your full name. Only your display-name preference is stored in
            local storage.
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
