import {
  ArrowUpRight,
  Camera,
  CameraOff,
  Check,
  Copy,
  Mic,
  MicOff,
  RotateCcw,
  Trophy,
} from 'lucide-react';
import { useState } from 'react';
import type { RoomSnapshot } from '../../shared/protocol';
import { copyText } from '../lib/client';
import { ResultAudio } from './ResultAudio';
import { AiVerdict } from './AiVerdict';

export function MatchResult({
  room,
  userId,
  onRematch,
  onLeave,
  busy,
  camera,
  microphone,
  onCamera,
  onMicrophone,
  remoteStream,
}: {
  room: RoomSnapshot;
  userId: string;
  onRematch: () => void;
  onLeave: () => void;
  busy: boolean;
  camera: boolean;
  microphone: boolean;
  onCamera: () => void;
  onMicrophone: () => void;
  remoteStream: MediaStream | null;
}) {
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const me = room.players.find((p) => p.id === userId)!;
  const opponent = room.players.find((p) => p.id !== userId)!;
  const winner = room.players.find((p) => p.id === room.winnerId);
  const won = room.winnerId === userId;
  const resultText = `${winner ? `${winner.name} took the battle` : 'An even rivalry'}! ${room.players[0].name} ${room.players[0].score} – ${room.players[1].score} ${room.players[1].name}. Your room is the arena. Play DuelBattle: ${location.origin}`;
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'DuelBattle results', text: resultText });
      else {
        await copyText(resultText);
        setCopied(true);
      }
      setShareError(null);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError'))
        setShareError('Sharing is unavailable. You can copy the result text below.');
    }
  };
  return (
    <section className="match-result" aria-labelledby="result-heading">
      <ResultAudio stream={remoteStream} />
      <div className="result-star">
        <Trophy size={38} />
      </div>
      <span className="eyebrow">BRAGGING RIGHTS: {winner ? 'CLAIMED' : 'SHARED'}</span>
      <h1 id="result-heading">
        {winner
          ? won
            ? 'You took the arena.'
            : `${winner.name} takes the arena.`
          : 'An even rivalry.'}
      </h1>
      <p>
        {won
          ? 'Go ahead. Be a little insufferable.'
          : winner
            ? 'This absolutely calls for a rematch.'
            : 'Some rivalries refuse to be settled.'}
      </p>
      <div className="final-score">
        <div>
          <span>
            {me.name} <small>YOU</small>
          </span>
          <strong>{me.score}</strong>
        </div>
        <span className="final-dash">:</span>
        <div>
          <span>{opponent.name}</span>
          <strong>{opponent.score}</strong>
        </div>
      </div>
      <div className="result-actions">
        <button
          className="button button-lime button-large"
          onClick={onRematch}
          disabled={busy || me.rematch || !camera}
        >
          {me.rematch ? (
            <>
              <Check size={21} /> Rematch requested
            </>
          ) : (
            <>
              <RotateCcw size={20} /> Run it back
            </>
          )}
        </button>
        <button className="button button-outline-light" onClick={() => void share()}>
          {copied ? <Check size={18} /> : <Copy size={18} />}
          {copied ? 'Result copied' : 'Share results'}
        </button>
      </div>
      <div className="result-media">
        <button onClick={onCamera} aria-label={camera ? 'Turn camera off' : 'Turn camera on'}>
          {camera ? <Camera size={16} /> : <CameraOff size={16} />}
          {camera ? 'Camera on' : 'Enable camera for rematch'}
        </button>
        <button
          onClick={onMicrophone}
          aria-label={microphone ? 'Mute microphone' : 'Enable microphone'}
        >
          {microphone ? <Mic size={15} /> : <MicOff size={15} />}
          {microphone ? 'Microphone on' : 'Microphone muted'}
        </button>
      </div>
      <p className="rematch-note" role="status">
        {me.rematch
          ? 'Waiting for your opponent to say yes…'
          : opponent.rematch
            ? `${opponent.name} wants a rematch. Your move.`
            : 'A rematch counts as one battle for each player.'}
      </p>
      {shareError && (
        <div className="share-fallback">
          <p>{shareError}</p>
          <textarea readOnly aria-label="Result text to copy" value={resultText} />
        </div>
      )}
      <div className="round-recap">
        <span className="eyebrow">THE PLAY-BY-PLAY</span>
        {room.history.map((r) => (
          <div key={r.number} className="recap-entry">
            <span className="recap-round">{String(r.number).padStart(2, '0')}</span>
            <span>{r.prompt}</span>
            <strong>
              {room.players.find((p) => p.id === r.winnerId)?.name ?? 'No points'}
              {r.winnerId && r.elapsedMs[r.winnerId] != null && (
                <small className="recap-time">
                  {(r.elapsedMs[r.winnerId]! / 1000).toFixed(1)}s
                </small>
              )}
            </strong>
            {r.judgement && (
              <details className="recap-judgement">
                <summary>AI verdict and recognized objects</summary>
                <p>{r.reason}</p>
                <AiVerdict judgement={r.judgement} players={room.players} />
              </details>
            )}
          </div>
        ))}
      </div>
      <button className="text-link text-link-light" onClick={onLeave}>
        Back to home <ArrowUpRight size={16} />
      </button>
    </section>
  );
}
