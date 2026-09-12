import { useCallback, useState } from 'react';
import { Check, Copy, Share2 } from 'lucide-react';
import {
  MATCH_LENGTHS,
  opponentOf,
  type PublicMatchState,
  type PublicProfile,
} from '@battle/shared';
import { RatingLine, Stakes } from '../components/Rating.jsx';
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
  standings: Record<string, PublicProfile>;
}

/**
 * The room before the match.
 *
 * One question at a time, in the order they actually arise: is somebody here,
 * how long are we playing, are you ready. Everything that is not one of those
 * three is below them or gone.
 *
 * What went: a panel of three sampled prompts that never changed after the page
 * loaded and told a waiting player nothing they could act on, and a bare camera
 * dropdown wedged between two buttons — a setting, and now on the settings
 * page, where somebody can work out which of three webcams is the right one
 * without an opponent watching them do it.
 *
 * What arrived: the room code stays reachable after the opponent turns up,
 * because the moment you most need to send the link again is the moment they
 * have dropped out of it.
 */
export function Lobby({ store, match, youId, camera, standings }: LobbyProps) {
  const you = match.players[youId] ?? null;
  const opponent = opponentOf(match, youId);
  const yourSeat = you?.seat ?? 0;
  const theirSeat = (yourSeat === 0 ? 1 : 0) as 0 | 1;
  const bothReady = Boolean(you?.ready && opponent?.ready);

  const headline = !opponent
    ? 'Every rivalry starts here.'
    : bothReady
      ? 'Here we go.'
      : `${opponent.name} is in the room.`;

  return (
    <div className="lobby">
      <header className="lobby__head">
        <p className="eyebrow">Private room · best of {match.settings.winTarget * 2 - 1}</p>
        <h1 className="lobby__title display">{headline}</h1>
        {opponent && (
          <div className="lobby__standings">
            <span className="lobby__side">
              <span className="lobby__who">{you?.name ?? 'You'}</span>
              <RatingLine profile={standings[youId]} delta={undefined} />
            </span>
            <Stakes you={standings[youId]} them={standings[opponent.id]} />
            <span className="lobby__side lobby__side--them">
              <span className="lobby__who">{opponent.name}</span>
              <RatingLine profile={standings[opponent.id]} delta={undefined} />
            </span>
          </div>
        )}
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

      <div className="lobby__controls">
        <MatchLength store={store} match={match} />
        <ReadyBar store={store} match={match} youId={youId} hasOpponent={Boolean(opponent)} />
      </div>

      <details className="lobby__extras">
        <summary>Write your own rounds</summary>
        <Deck store={store} match={match} youId={youId} />
      </details>

      {/* Always reachable, never in the way. The one time a room code matters
          after somebody has joined is when they have just dropped out. */}
      {opponent && <ShareLine code={match.roomCode} />}
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
          Send the link. The match starts the moment you are both ready.
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

/** Copying, without a second component that does the same thing differently. */
function useCopier(): [('link' | 'code') | null, (text: string, kind: 'link' | 'code') => void] {
  const [copied, setCopied] = useState<'link' | 'code' | null>(null);
  const copy = useCallback((text: string, kind: 'link' | 'code') => {
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(kind);
        window.setTimeout(() => setCopied(null), 1_800);
      })
      // Clipboard access can be refused; the code is on screen to be read out.
      .catch(() => setCopied(null));
  }, []);
  return [copied, copy];
}

function InvitePanel({ code, seat }: { code: string; seat: 0 | 1 }) {
  const [copied, copy] = useCopier();
  const url = roomUrl(code);

  const share = useCallback(async () => {
    if (!navigator.share) {
      copy(url, 'link');
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
      <button className="invite__code" onClick={() => copy(code, 'code')} title="Copy code">
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

function ShareLine({ code }: { code: string }) {
  const [copied, copy] = useCopier();
  return (
    <p className="shareline">
      <span className="shareline__label">Room</span>
      <span className="shareline__code mono">{code}</span>
      <button className="shareline__btn" onClick={() => copy(roomUrl(code), 'link')}>
        {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
        {copied ? 'Link copied' : 'Copy link'}
      </button>
      {typeof navigator !== 'undefined' && 'share' in navigator && (
        <button
          className="shareline__btn"
          onClick={() =>
            void navigator.share?.({ title: 'Battle', url: roomUrl(code) }).catch(() => {})
          }
        >
          <Share2 size={13} aria-hidden="true" /> Share
        </button>
      )}
    </p>
  );
}
