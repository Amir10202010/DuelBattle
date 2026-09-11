import { useEffect, useId, useRef, useState } from 'react';
import {
  MAX_NAME_LENGTH,
  ROOM_CODE_LENGTH,
  extractRoomCode,
  isValidRoomCode,
  normalizeRoomCode,
} from '@battle/shared';
import type { MatchStore } from '../net/store.js';
import { recoverableSession, rememberedName } from '../net/store.js';
import { describeLookup, useRoomLookup } from '../hooks/useRoomLookup.js';

interface HomeProps {
  store: MatchStore;
  /** Code lifted from a /r/CODE link, if the player arrived through an invite. */
  invitedCode: string | null;
  joining: boolean;
  error: string | null;
  offline: boolean;
}

const STEPS = [
  ['01', 'Send a link', 'One friend, one room. No account, no install.'],
  ['02', 'Get a prompt', 'Both of you see the same challenge at the same second.'],
  ['03', 'Grab it first', 'Hold it up. Fastest valid answer takes the round.'],
] as const;

export function Home({ store, invitedCode, joining, error, offline }: HomeProps) {
  const [name, setName] = useState(rememberedName);
  const [code, setCode] = useState(invitedCode ?? '');
  const [mode, setMode] = useState<'choose' | 'join'>(invitedCode ? 'join' : 'choose');
  const [touched, setTouched] = useState(false);
  const nameId = useId();
  const codeId = useId();
  const nameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (invitedCode) {
      setCode(invitedCode);
      setMode('join');
    }
  }, [invitedCode]);

  useEffect(() => {
    // An invited player already knows which room they want; the only thing left
    // to ask is who they are.
    if (invitedCode) nameRef.current?.focus();
  }, [invitedCode]);

  // A seat this browser still holds in the room being opened: offer it back
  // explicitly rather than assuming this tab is the same player.
  const recoverable = invitedCode ? recoverableSession(invitedCode) : null;

  const trimmedName = name.trim();
  const nameOk = trimmedName.length > 0;
  const codeOk = isValidRoomCode(code);
  const busy = joining || offline;

  // Checked while they are still looking at the field, rather than after they
  // have handed over a camera.
  const lookup = useRoomLookup(mode === 'join' ? code : '');
  const lookupNote = describeLookup(lookup);

  const submitCreate = () => {
    setTouched(true);
    if (!nameOk || busy) return;
    store.createRoom(trimmedName);
  };

  const submitJoin = () => {
    setTouched(true);
    if (!nameOk || !codeOk || busy) return;
    store.joinRoom(code, trimmedName);
  };

  return (
    <main className="home">
      <div className="home__masthead">
        <h1 className="home__wordmark display">BATTLE</h1>
        <p className="home__tagline">Your room is the game.</p>
      </div>

      <div className="home__body">
        <section className="home__pitch">
          <p className="home__lede">
            Two players, two cameras, one prompt at a time. Everything you need to win is already
            within arm&rsquo;s reach — you just have to find it faster than they do.
          </p>
          <ol className="steps">
            {STEPS.map(([n, title, detail]) => (
              <li key={n} className="steps__item">
                <span className="steps__num mono">{n}</span>
                <div>
                  <h3 className="steps__title">{title}</h3>
                  <p className="steps__detail dim">{detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="home__form" aria-label="Start or join a match">
          <div className="field">
            <label htmlFor={nameId}>Your name</label>
            <input
              id={nameId}
              ref={nameRef}
              className="input"
              value={name}
              maxLength={MAX_NAME_LENGTH}
              autoComplete="nickname"
              placeholder="Who are you?"
              enterKeyHint={mode === 'join' ? 'go' : 'done'}
              onChange={(e) => {
                setName(e.target.value);
                store.clearJoinError();
              }}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                if (mode === 'join') submitJoin();
                else submitCreate();
              }}
            />
            {touched && !nameOk && <p className="error-text">Pick a name so your opponent knows who won.</p>}
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

          {mode === 'choose' ? (
            <>
              <button className="btn btn--primary btn--lg btn--block" onClick={submitCreate} disabled={busy}>
                {joining ? 'Opening a room…' : 'Start a battle'}
              </button>
              <div className="home__or">
                <span>or</span>
              </div>
              <button className="btn btn--block" onClick={() => setMode('join')} disabled={busy}>
                I have a room code
              </button>
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
                    setCode(
                      extractRoomCode(raw) ?? normalizeRoomCode(raw).slice(0, ROOM_CODE_LENGTH),
                    );
                    store.clearJoinError();
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && submitJoin()}
                />
              </div>
              {lookupNote && (
                <p
                  className={`lookup lookup--${lookup.state}`}
                  role="status"
                  aria-live="polite"
                >
                  {lookupNote}
                </p>
              )}
              <button
                className="btn btn--primary btn--lg btn--block"
                onClick={submitJoin}
                disabled={busy || !codeOk || lookup.state === 'full'}
              >
                {joining ? 'Joining…' : 'Join the battle'}
              </button>
              <button className="btn btn--ghost btn--block" onClick={() => setMode('choose')} disabled={busy}>
                Start my own instead
              </button>
            </>
          )}

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

          <p className="home__fineprint">
            Battle uses your camera while a match is running. Frames go to your opponent and are
            kept only long enough to score the round — nothing is recorded or stored.
          </p>
        </section>
      </div>
    </main>
  );
}
