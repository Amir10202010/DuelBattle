import { useEffect, useId, useRef, useState } from 'react';
import { Link2, Radar, Users } from 'lucide-react';
import {
  MAX_NAME_LENGTH,
  ROOM_CODE_LENGTH,
  extractRoomCode,
  isPlaced,
  isValidRoomCode,
  normalizeRoomCode,
  type PublicProfile,
} from '@battle/shared';
import type { MatchStore, QueueState } from '../net/store.js';
import { recoverableSession, rememberedName } from '../net/store.js';
import { describeLookup, useRoomLookup } from '../hooks/useRoomLookup.js';
import { useNow } from '../hooks/useNow.js';
import { RankBadge } from '../components/Identity.jsx';

interface PlayProps {
  store: MatchStore;
  /** Code lifted from a /r/CODE link, if the player arrived through an invite. */
  invitedCode: string | null;
  joining: boolean;
  error: string | null;
  offline: boolean;
  queue: QueueState | null;
  profile: PublicProfile | null;
}

/**
 * The one page that has to work.
 *
 * Before this existed there was exactly one way into a match: be sent a link by
 * somebody who already had one. A stranger who read the front page and pressed
 * the only button got a room with nobody in it and a code to send to nobody.
 *
 * So the order here is the order of what a player can actually do. Finding an
 * opponent is first and is the loud one. Opening a room for a friend is second,
 * because it needs a friend. Typing a code is third, because anybody who has
 * one arrived through the link anyway and is already past this screen.
 */
export function Play({ store, invitedCode, joining, error, offline, queue, profile }: PlayProps) {
  const [name, setName] = useState(() => profile?.name || rememberedName());
  const [mode, setMode] = useState<'pick' | 'code'>(invitedCode ? 'code' : 'pick');
  const [code, setCode] = useState(invitedCode ?? '');
  const [touched, setTouched] = useState(false);
  const nameId = useId();
  const codeId = useId();
  const nameRef = useRef<HTMLInputElement | null>(null);

  // A name the server already knows beats whatever this tab remembered.
  useEffect(() => {
    if (profile?.name) setName((current) => current || profile.name);
  }, [profile?.name]);

  useEffect(() => {
    if (!invitedCode) return;
    setCode(invitedCode);
    setMode('code');
    // An invited player already knows which room they want. The only thing left
    // to ask is who they are.
    nameRef.current?.focus();
  }, [invitedCode]);

  const recoverable = invitedCode ? recoverableSession(invitedCode) : null;
  const trimmed = name.trim();
  const nameOk = trimmed.length > 0;
  const busy = joining || offline;
  const lookup = useRoomLookup(mode === 'code' ? code : '');
  const lookupNote = describeLookup(lookup);

  const guard = (run: () => void) => () => {
    setTouched(true);
    if (!nameOk || busy) {
      if (!nameOk) nameRef.current?.focus();
      return;
    }
    run();
  };

  const find = guard(() => store.findMatch(trimmed));
  const open = guard(() => store.createRoom(trimmed));
  const join = guard(() => {
    if (!isValidRoomCode(code)) return;
    store.joinRoom(code, trimmed);
  });

  if (queue) return <Searching queue={queue} profile={profile} onCancel={() => store.cancelFind()} />;

  return (
    <main className="page page--play">
      <header className="page__head">
        <p className="eyebrow">Play</p>
        <h1 className="page__title display">Find somebody to beat.</h1>
        <p className="page__lede">
          Two players, two cameras, one prompt at a time. Everything you need to win is already
          within arm&rsquo;s reach.
        </p>
      </header>

      <div className="field field--name">
        <label htmlFor={nameId}>Your name</label>
        <input
          id={nameId}
          ref={nameRef}
          className="input"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          autoComplete="nickname"
          placeholder="Who are you?"
          onChange={(e) => {
            setName(e.target.value);
            store.clearJoinError();
          }}
          onKeyDown={(e) => e.key === 'Enter' && (mode === 'code' ? join() : find())}
        />
        {touched && !nameOk && (
          <p className="error-text">Pick a name so your opponent knows who won.</p>
        )}
      </div>

      {recoverable && (
        <div className="resume">
          <p className="resume__text">
            This browser was in room {invitedCode} as <strong>{recoverable.name}</strong>.
          </p>
          <button
            className="btn btn--block"
            disabled={busy}
            onClick={() => invitedCode && store.recoverSession(invitedCode)}
          >
            Take that seat back
          </button>
        </div>
      )}

      <section className="option option--primary">
        <div className="option__head">
          <Radar size={18} aria-hidden="true" />
          <h2 className="option__title">Quick match</h2>
        </div>
        <p className="option__body">
          We pair you with whoever is closest to your rating. It counts towards your rank.
        </p>
        <button className="btn btn--primary btn--lg btn--block" onClick={find} disabled={busy}>
          Find an opponent
        </button>
      </section>

      <section className="option">
        <div className="option__head">
          <Users size={18} aria-hidden="true" />
          <h2 className="option__title">Play a friend</h2>
        </div>
        {mode === 'pick' ? (
          <>
            <p className="option__body">
              Open a private room and send them the link. Nobody else can get in.
            </p>
            <div className="option__actions">
              <button className="btn btn--block" onClick={open} disabled={busy}>
                {joining ? 'Opening a room…' : 'Open a room'}
              </button>
              <button className="btn btn--ghost btn--block" onClick={() => setMode('code')} disabled={busy}>
                <Link2 size={15} aria-hidden="true" /> I have a code
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="field">
              <label htmlFor={codeId}>Room code</label>
              <input
                id={codeId}
                className="input input--code"
                value={code}
                inputMode="text"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                placeholder="ABCDE"
                enterKeyHint="go"
                onChange={(e) => {
                  // Pasting the whole invite link is at least as likely as
                  // typing five characters, so accept either.
                  const raw = e.target.value;
                  setCode(extractRoomCode(raw) ?? normalizeRoomCode(raw).slice(0, ROOM_CODE_LENGTH));
                  store.clearJoinError();
                }}
                onKeyDown={(e) => e.key === 'Enter' && join()}
              />
            </div>
            {/* A specific answer beats live validation guessing at one. */}
            {lookupNote && !error && (
              <p className={`lookup lookup--${lookup.state}`} role="status" aria-live="polite">
                {lookupNote}
              </p>
            )}
            <div className="option__actions">
              <button
                className="btn btn--primary btn--block"
                onClick={join}
                disabled={busy || !isValidRoomCode(code) || lookup.state === 'full'}
              >
                {joining ? 'Joining…' : 'Join the battle'}
              </button>
              <button className="btn btn--ghost btn--block" onClick={() => setMode('pick')} disabled={busy}>
                Back
              </button>
            </div>
          </>
        )}
      </section>

      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {offline && (
        <p className="error-text" role="status">
          Can&rsquo;t reach the server. Retrying…
        </p>
      )}
    </main>
  );
}

/**
 * The wait.
 *
 * An indeterminate spinner tells somebody nothing except that the page has not
 * frozen. A position, a head count and a clock tell them whether to keep
 * waiting, which is the actual question. The line about the search widening is
 * true — the server really does open the rating window as you wait — and it is
 * the reason a long wait ends rather than continuing forever.
 */
function Searching({
  queue,
  profile,
  onCancel,
}: {
  queue: QueueState;
  profile: PublicProfile | null;
  onCancel: () => void;
}) {
  const now = useNow(1_000);
  const seconds = Math.max(0, Math.floor((now - queue.since) / 1000));
  const alone = queue.waiting <= 1;

  return (
    <main className="page page--searching">
      <div className="searching">
        <div className="searching__pulse" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <p className="eyebrow">Looking for an opponent</p>
        <h1 className="searching__title display">
          {alone ? 'Nobody else is waiting yet.' : 'Finding somebody your size.'}
        </h1>
        <p className="searching__body dim">
          {alone
            ? 'You are first in the queue. The moment somebody else presses play, you are in.'
            : `${queue.waiting} waiting. The search widens the longer you are here, so it will not run forever.`}
        </p>

        <dl className="searching__stats">
          <div>
            <dt>In the queue</dt>
            <dd className="mono">{queue.waiting}</dd>
          </div>
          <div>
            <dt>Your place</dt>
            <dd className="mono">{queue.position || '—'}</dd>
          </div>
          <div>
            <dt>Waiting</dt>
            <dd className="mono">
              {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
            </dd>
          </div>
        </dl>

        {profile && profile.matchesPlayed > 0 && (
          <p className="searching__rank">
            Matching around <RankBadge rating={profile.rating} placed={isPlaced(profile.matchesPlayed)} size="sm" />
          </p>
        )}

        <button className="btn btn--lg" onClick={onCancel}>
          Stop looking
        </button>
      </div>
    </main>
  );
}
