import { useCallback, useMemo, useState } from 'react';
import { MATCH_LENGTHS, opponentOf, samplePrompts, type PublicMatchState } from '@battle/shared';
import type { MatchStore } from '../net/store.js';
import type { CameraState } from '../media/useCamera.js';
import { PeerVideo, SelfVideo, StageFrame } from '../components/Stage.jsx';
import { SeriesLine } from '../components/Series.jsx';
import { Deck } from '../components/Deck.jsx';
import { roomUrl } from '../hooks/useRoute.js';

interface LobbyProps {
  store: MatchStore;
  match: PublicMatchState;
  youId: string;
  camera: CameraState;
}

export function Lobby({ store, match, youId, camera }: LobbyProps) {
  const you = match.players[youId] ?? null;
  const opponent = opponentOf(match, youId);
  const yourSeat = you?.seat ?? 0;
  const theirSeat = (yourSeat === 0 ? 1 : 0) as 0 | 1;

  const headline = !opponent
    ? 'Every rivalry starts here.'
    : you?.ready && opponent.ready
      ? 'Here we go.'
      : `${opponent.name} is in the room.`;

  return (
    <div className="lobby">
      <header className="lobby__head">
        <p className="eyebrow">
          Private arena · best of {match.settings.winTarget * 2 - 1}
        </p>
        <h1 className="lobby__title display">{headline}</h1>
      </header>

      <div className="lobby__stages">
        <span className="vs" aria-hidden="true">
          VS
        </span>
        <StageFrame seat={yourSeat} player={you} state={you?.ready ? 'locked' : 'live'}>
          <SelfVideo videoRef={camera.videoRef} />
        </StageFrame>

        {opponent ? (
          <StageFrame seat={theirSeat} player={opponent} state={opponent.ready ? 'locked' : 'live'}>
            <PeerVideo store={store} playerId={opponent.id} />
          </StageFrame>
        ) : (
          <InvitePanel code={match.roomCode} seat={theirSeat} />
        )}
      </div>

      <SeriesLine match={match} youId={youId} className="lobby__series" />
      <Taster />
      <Deck store={store} match={match} youId={youId} />

      <div className="lobby__controls">
        <MatchLength store={store} match={match} />
        <ReadyBar store={store} match={match} youId={youId} hasOpponent={Boolean(opponent)} />
        {camera.devices.length > 1 && (
          <select
            className="lobby__camera-select"
            aria-label="Camera"
            value={camera.deviceId ?? ''}
            onChange={(e) => camera.selectDevice(e.target.value)}
          >
            {camera.devices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

/** How long you are both signing up for. Either player can change it. */
function MatchLength({ store, match }: { store: MatchStore; match: PublicMatchState }) {
  return (
    <div className="length" role="group" aria-label="Match length">
      {MATCH_LENGTHS.map((length) => {
        const active = match.settings.winTarget === length.winTarget;
        return (
          <button
            key={length.winTarget}
            type="button"
            className={`length__option ${active ? 'is-active' : ''}`}
            aria-pressed={active}
            onClick={() => store.setWinTarget(length.winTarget)}
          >
            <span className="length__label">{length.label}</span>
            <span className="length__detail">first to {length.winTarget}</span>
          </button>
        );
      })}
    </div>
  );
}

/** What the game is about to ask, so nobody readies up blind. */
function Taster() {
  const prompts = useMemo(() => samplePrompts(3), []);
  return (
    <div className="taster">
      <span className="eyebrow taster__label">Rounds look like</span>
      <ul className="taster__list">
        {prompts.map((prompt) => (
          <li key={prompt}>{prompt}</li>
        ))}
      </ul>
    </div>
  );
}

function ReadyBar({
  store,
  match,
  youId,
  hasOpponent,
}: {
  store: MatchStore;
  match: PublicMatchState;
  youId: string;
  hasOpponent: boolean;
}) {
  const you = match.players[youId];
  const ready = you?.ready ?? false;
  const first = match.roundNumber === 0 && match.history.length === 0;

  if (!hasOpponent) {
    return (
      <div className="readybar readybar--waiting">
        <span className="readybar__hint">
          Share the code. The match starts the moment you are both ready.
        </span>
      </div>
    );
  }

  return (
    <div className="readybar">
      <p className="readybar__hint">
        {ready
          ? 'Waiting for your opponent…'
          : first
            ? `First to ${match.settings.winTarget} rounds wins. Stand where you can reach things.`
            : 'Ready when you are.'}
      </p>
      <button
        className={`btn btn--lg ${ready ? '' : 'btn--primary'}`}
        onClick={() => store.setReady(!ready)}
      >
        {ready ? 'Not ready' : "I'm ready"}
      </button>
    </div>
  );
}

function InvitePanel({ code, seat }: { code: string; seat: 0 | 1 }) {
  const [copied, setCopied] = useState<'link' | 'code' | null>(null);
  const url = roomUrl(code);

  const copy = useCallback(async (text: string, kind: 'link' | 'code') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1_800);
    } catch {
      // Clipboard access can be refused; the code is on screen to be read out.
      setCopied(null);
    }
  }, []);

  const share = useCallback(async () => {
    if (!navigator.share) {
      void copy(url, 'link');
      return;
    }
    try {
      await navigator.share({ title: 'Battle', text: 'Play a round with me', url });
    } catch {
      // A dismissed share sheet is not an error.
    }
  }, [copy, url]);

  return (
    <section className={`invite invite--seat${seat}`}>
      <p className="eyebrow">Waiting for an opponent</p>
      <button className="invite__code" onClick={() => void copy(code, 'code')} title="Copy code">
        {code.split('').map((char, i) => (
          <span key={i}>{char}</span>
        ))}
      </button>
      <p className="invite__hint dim">
        {copied === 'code' ? 'Code copied.' : 'Read it out, or send the link.'}
      </p>
      <div className="invite__actions">
        <button className="btn btn--primary" onClick={() => void share()}>
          {copied === 'link' ? 'Link copied' : 'Send invite link'}
        </button>
      </div>
      <div className="invite__pulse" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
    </section>
  );
}
