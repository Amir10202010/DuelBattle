import { useEffect, useId, useRef, useState } from 'react';
import { MoveUpRight, Zap } from 'lucide-react';
import {
  MAX_NAME_LENGTH,
  ROOM_CODE_LENGTH,
  extractRoomCode,
  getChallenge,
  isPlaced,
  isValidRoomCode,
  normalizeRoomCode,
  tierFor,
  type PublicProfile,
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
  /** Null until the server has recognised this browser, and for a first visit. */
  profile: PublicProfile | null;
}

const STEPS = [
  ['01', 'Find your rival', 'Send one link. No account, no install, nothing to download.'],
  ['02', 'Camera on, game on', 'You both get the same prompt at the same second.'],
  ['03', 'Grab it first', 'Hold it up. The fastest valid answer takes the round.'],
] as const;

/**
 * Three real prompts, one per judge.
 *
 * Pulled from the catalogue rather than retyped, so the shop window cannot end
 * up advertising a round the game does not have.
 */
const SHOWCASE = [
  { id: 'color-red', judge: 'The camera decides', tone: 'coral', note: '20 seconds.' },
  { id: 'act-blue-head', judge: 'The AI judge decides', tone: 'lime', note: 'Yes, really.' },
  { id: 'story-older', judge: 'Your opponent decides', tone: 'paper', note: 'A story counts.' },
] as const;

const MARQUEE = ['See it', 'Grab it', 'Show it', 'Win it', 'Rematch'];

export function Home({ store, invitedCode, joining, error, offline, profile }: HomeProps) {
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
    <main className="landing">
      <header className="landing__bar">
        <span className="wordmark">
          <span className="wordmark__mark" aria-hidden="true">
            <Zap size={21} fill="currentColor" strokeWidth={2.5} />
          </span>
          DUEL<span className="wordmark__half">BATTLE</span>
          <span className="wordmark__beta">BETA</span>
        </span>
        {/* A returning player is greeted by rank rather than by a tagline they
            have already read. */}
        {profile && profile.matchesPlayed > 0 ? (
          <span className="landing__rank">
            <span className="landing__ranktier">
              {isPlaced(profile.matchesPlayed) ? tierFor(profile.rating).name : 'Placing'}
            </span>
            <span className="landing__rankvalue mono">{profile.rating}</span>
            <span className="landing__rankrecord">
              {profile.wins}W &middot; {profile.losses}L
            </span>
          </span>
        ) : (
          <span className="landing__barnote">Two players. One prompt. Your room.</span>
        )}
      </header>

      <section className="hero">
        <div className="hero__pitch">
          <p className="eyebrow eyebrow--mark">Real friends, real-time rivalry</p>
          <h1 className="hero__title display">
            Your room
            <br />
            is the <span className="hero__mark">arena.</span>
          </h1>
          <p className="hero__lede">
            Two players, two cameras, one prompt at a time. Everything you need to win is already
            within arm&rsquo;s reach — you just have to find it faster than they do.
          </p>

          <div className="hero__form" aria-label="Start or join a match">
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

            {mode === 'choose' ? (
              <>
                <button
                  className="btn btn--primary btn--lg btn--block"
                  onClick={submitCreate}
                  disabled={busy}
                >
                  {joining ? 'Opening a room…' : 'Start a battle'}
                </button>
                <div className="hero__or">
                  <span>or</span>
                </div>
                <button
                  className="btn btn--block"
                  onClick={() => setMode('join')}
                  disabled={busy}
                >
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
                {/* A specific answer beats live validation guessing at one. When
                    a match dies because the room closed, "No room with that
                    code — check the letters?" is advice for a problem the
                    player does not have; the code came from their own invite
                    link. Editing the field clears the error and the hint
                    comes back. */}
                {lookupNote && !error && (
                  <p className={`lookup lookup--${lookup.state}`} role="status" aria-live="polite">
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
                <button
                  className="btn btn--ghost btn--block"
                  onClick={() => setMode('choose')}
                  disabled={busy}
                >
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
          </div>
        </div>

        <aside className="hero__demo">
          <div className="scene">
            <div className="scene__topline" aria-hidden="true">
              <span>This could get personal</span>
              <span className="mono">01 / 05</span>
            </div>

            <div className="scene__photo">
              <img
                src="/friends.jpg"
                alt="Two people in separate rooms, one holding up a red mug and the other a red trainer."
                width={1200}
                height={800}
                fetchPriority="high"
              />
              <span className="scene__vs" aria-hidden="true">
                VS
              </span>
              <span className="scene__player scene__player--one" aria-hidden="true">
                The mug person
              </span>
              <span className="scene__player scene__player--two" aria-hidden="true">
                The shoe person
              </span>
            </div>

            <div className="scene__challenge">
              <span className="scene__label">
                <Zap size={13} fill="currentColor" aria-hidden="true" /> Example challenge
              </span>
              <span className="scene__prompt display">
                Show something <span className="hero__mark">red.</span>
              </span>
              <MoveUpRight size={28} aria-hidden="true" />
            </div>

            <div className="scene__caption">
              <span>One challenge. Two very different answers.</span>
              <span className="scene__credit">Staged scene</span>
            </div>
          </div>

          <span className="sticker" aria-hidden="true">
            Less scroll
            <br />
            more chaos
          </span>
        </aside>
      </section>

      <div className="marquee" aria-hidden="true">
        <div className="marquee__track">
          {[0, 1].map((copy) => (
            <span key={copy} className="marquee__run">
              {MARQUEE.map((word) => (
                <span key={word} className="marquee__word display">
                  {word}
                  <i className="marquee__star">✳</i>
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>

      <section className="rules">
        <p className="eyebrow">The rules are simple</p>
        <div className="rules__head">
          <h2 className="rules__title display">
            A little panic.
            <br />A lot of fun.
          </h2>
          <p className="rules__aside">
            All you need is a rival, a camera, and whatever is within reach.
          </p>
        </div>
        <ol className="steps">
          {STEPS.map(([n, title, detail]) => (
            <li key={n} className="steps__item">
              <span className="steps__num mono">{n}</span>
              <h3 className="steps__title">{title}</h3>
              <p className="steps__detail">{detail}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="showcase">
        <div className="showcase__head">
          <div>
            <p className="eyebrow">Expect the unexpected</p>
            <h2 className="showcase__title display">
              Your junk drawer
              <br />
              has been training for this.
            </h2>
          </div>
          <p className="showcase__aside">
            56 challenges, three different referees, and zero preparation required.
          </p>
        </div>
        <div className="cards">
          {SHOWCASE.map(({ id, judge, tone, note }) => {
            const challenge = getChallenge(id);
            if (!challenge) return null;
            return (
              <article key={id} className={`card card--${tone}`}>
                <p className="card__judge">{judge}</p>
                <p className="card__prompt display">{challenge.prompt}</p>
                <p className="card__note">{note}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="fairplay">
        <p className="eyebrow">Nobody likes a cheat</p>
        <div className="fairplay__grid">
          <h2 className="fairplay__title display">
            Show it. Prove it.
            <br />
            Keep it friendly.
          </h2>
          <div className="fairplay__body">
            <p>
              Your snapshot is scored against the frame taken before the prompt appeared, so the
              red rug that was already in shot earns nothing and the red mug you lifted into view
              earns everything.
            </p>
            <p>
              The server re-runs every check itself. A modified browser can change what it shows
              you; it cannot change what it wins.
            </p>
            <p className="fairplay__fine">
              Frames go to your opponent and are kept only long enough to score the round. Nothing
              is recorded, nothing is stored, and there is no microphone.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
