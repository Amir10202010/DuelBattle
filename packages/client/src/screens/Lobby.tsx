import { tr, useUiPreferences } from '../i18n/index.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, Share2, Users } from 'lucide-react';
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
 * One question at a time, in the order they arise: is somebody here, how long
 * are we playing, are you ready. The arrival of an opponent is the one moment
 * worth making noise about, so it gets a reveal — the two stages slam into
 * place behind a VS, once, and then the room settles into the ready state.
 */
export function Lobby({ store, match, youId, camera, standings }: LobbyProps) {
  useUiPreferences();
  const you = match.players[youId] ?? null;
  const opponent = opponentOf(match, youId);
  const yourSeat = you?.seat ?? 0;
  const theirSeat = (yourSeat === 0 ? 1 : 0) as 0 | 1;
  const bothReady = Boolean(you?.ready && opponent?.ready);
  const arriving = useArrival(opponent?.id ?? null);

  const headline = !opponent
    ? 'Every rivalry starts here.'
    : arriving
      ? `${opponent.name} is in.`
      : bothReady
        ? 'Here we go.'
        : 'Ready when you both are.';

  return (
    <div className={`lobby ${arriving ? 'lobby--found' : ''}`}>
      <header className="lobby__head">
        <span className="eyebrow">
          {tr(match.ranked ? 'Ranked duel' : 'Friendly room')}
          <i>{'·'}</i>
          {tr('first to ')}
          {match.settings.winTarget}
        </span>
        <h1 className="lobby__title display">{tr(headline)}</h1>
        {opponent && (
          <div className="lobby__standings">
            <span className="lobby__side">
              <span className="lobby__who">{you?.name ?? tr('You')}</span>
              <RatingLine profile={standings[youId]} delta={undefined} />
            </span>
            {match.ranked && <Stakes you={standings[youId]} them={standings[opponent.id]} />}
            <span className="lobby__side lobby__side--them">
              <span className="lobby__who">{opponent.name}</span>
              <RatingLine profile={standings[opponent.id]} delta={undefined} />
            </span>
          </div>
        )}
      </header>

      <div className="lobby__stages">
        <span className="vs" aria-hidden="true">
          {tr('VS')}
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
        {!match.ranked && <MatchLength store={store} match={match} />}
        <ReadyBar store={store} match={match} youId={youId} hasOpponent={Boolean(opponent)} />
      </div>

      {match.ranked ? (
        <details className="lobby__fine">
          <summary>{tr('Ranked rules')}</summary>
          <p>
            {tr(
              'Leaving a live battle can count as a loss and pauses ranked matchmaking for five minutes. Reconnect time is shared across the match.',
            )}
          </p>
        </details>
      ) : (
        <details className="lobby__fine">
          <summary>{tr('Write your own rounds')}</summary>
          <Deck store={store} match={match} youId={youId} />
        </details>
      )}

      {/* Always reachable, never in the way. The one time a room code matters
          after somebody has joined is when they have just dropped out. */}
      {opponent && <ShareLine code={match.roomCode} />}
    </div>
  );
}

/**
 * True for a beat after an opponent takes the other seat.
 *
 * Only on the transition from empty to occupied: a reconnect is not an arrival,
 * and replaying the reveal every time the socket blinks would be noise.
 */
function useArrival(opponentId: string | null): boolean {
  const [arriving, setArriving] = useState(false);
  const previous = useRef<string | null>(opponentId);
  useEffect(() => {
    const had = previous.current;
    previous.current = opponentId;
    if (!opponentId || had === opponentId) return;
    setArriving(true);
    const timer = window.setTimeout(() => setArriving(false), 1600);
    return () => window.clearTimeout(timer);
  }, [opponentId]);
  return arriving;
}

/** How long you are both signing up for. Either player can change it. */
function MatchLength({ store, match }: { store: MatchStore; match: PublicMatchState }) {
  useUiPreferences();
  return (
    <div className="length" role="group" aria-label={tr('Match length')}>
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
            <strong>{tr(length.label)}</strong>
            <small>
              {tr('first to ')}
              {length.winTarget}
            </small>
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
  useUiPreferences();
  const you = match.players[youId];
  const opponent = opponentOf(match, youId);
  const ready = you?.ready ?? false;
  const first = match.roundNumber === 0 && match.history.length === 0;

  if (!hasOpponent) {
    return (
      <div className="readybar readybar--waiting">
        <Users size={17} />
        <span>{tr('Send the link. The battle starts the moment you are both ready.')}</span>
      </div>
    );
  }

  return (
    <div className="readybar">
      <div className="readybar__states" aria-hidden="true">
        <span className={ready ? 'is-ready' : ''}>
          {ready && <Check size={13} />}
          {tr('You')}
        </span>
        <span className={opponent?.ready ? 'is-ready' : ''}>
          {opponent?.ready && <Check size={13} />}
          {opponent?.name}
        </span>
      </div>
      <p className="readybar__hint" role="status">
        {tr(
          ready
            ? 'Waiting for your opponent…'
            : first
              ? `First to ${match.settings.winTarget} rounds wins. Stand where you can reach things.`
              : 'Ready when you are.',
        )}
      </p>
      <button
        className={`btn btn--lg ${ready ? '' : 'btn--primary'}`}
        onClick={() => store.setReady(!ready)}
      >
        {tr(ready ? 'Not ready' : 'I’m ready')}
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
  useUiPreferences();
  const [copied, copy] = useCopier();
  const url = roomUrl(code);

  const share = useCallback(async () => {
    if (!navigator.share) {
      copy(url, 'link');
      return;
    }
    try {
      await navigator.share({ title: 'DuelBattle', text: 'Play a round with me', url });
    } catch {
      // A dismissed share sheet is not an error.
    }
  }, [copy, url]);

  return (
    <section className={`invite invite--seat${seat}`}>
      <div className="invite__pulse" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <span className="eyebrow">{tr('Waiting for an opponent')}</span>
      <button className="invite__code" onClick={() => copy(code, 'code')} title={tr('Copy code')}>
        {code.split('').map((char, i) => (
          <span key={i}>{char}</span>
        ))}
      </button>
      <p className="invite__hint dim" role="status">
        {tr(copied === 'code' ? 'Code copied.' : 'Read it out, or send the link.')}
      </p>
      <button className="btn btn--primary" onClick={() => void share()}>
        {copied === 'link' ? <Check size={16} /> : <Share2 size={16} />}
        {tr(copied === 'link' ? 'Link copied' : 'Send invite link')}
      </button>
    </section>
  );
}

function ShareLine({ code }: { code: string }) {
  useUiPreferences();
  const [copied, copy] = useCopier();
  return (
    <p className="shareline">
      <span className="eyebrow">{tr('Room')}</span>
      <span className="shareline__code mono">{code}</span>
      <button className="shareline__btn" onClick={() => copy(roomUrl(code), 'link')}>
        {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
        {tr(copied ? 'Link copied' : 'Copy link')}
      </button>
      {typeof navigator !== 'undefined' && 'share' in navigator && (
        <button
          className="shareline__btn"
          onClick={() =>
            void navigator.share?.({ title: 'DuelBattle', url: roomUrl(code) }).catch(() => {})
          }
        >
          <Share2 size={13} aria-hidden="true" />
          {tr('Share')}
        </button>
      )}
    </p>
  );
}
