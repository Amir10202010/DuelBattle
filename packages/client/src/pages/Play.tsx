import { tr, useUiPreferences } from '../i18n/index.js';
import { useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, Link2, Radar, Swords, Users, WifiOff, X } from 'lucide-react';
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
import { rememberedMode, rememberMode, type PlayMode } from '../net/playMode.js';
import { RankBadge } from '../components/Identity.jsx';
import { ModePicker } from '../components/play/ModePicker.jsx';
import { Hero } from '../components/avatar/Hero.jsx';

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
 * The order is the order of what a player can actually do. Finding an opponent
 * is first and is the loud one. Opening a room for a friend is second, because
 * it needs a friend. Typing a code is third, because anybody who has one
 * arrived through the link anyway and is already past this screen.
 */
export function Play({ store, invitedCode, joining, error, offline, queue, profile }: PlayProps) {
  useUiPreferences();
  const [playMode, setPlayMode] = useState<PlayMode>(() => (profile ? rememberedMode() : 'casual'));
  const chooseMode = (value: PlayMode) => {
    setPlayMode(value);
    rememberMode(value);
  };
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
  // An account with a name needs no name field. Two cases still do: a brand new
  // player who has not finished onboarding, and anybody the server has just
  // turned away — display names are not unique, so "someone in there is already
  // using that name" is a dead end unless the field comes back.
  const needsName = !profile?.name || Boolean(error);

  const guard = (run: () => void) => () => {
    setTouched(true);
    if (!nameOk || busy) {
      if (!nameOk) nameRef.current?.focus();
      return;
    }
    run();
  };

  const find = guard(() => store.findMatch(trimmed, profile ? playMode : 'casual'));
  const open = guard(() => store.createRoom(trimmed));
  const join = guard(() => {
    if (!isValidRoomCode(code)) return;
    store.joinRoom(code, trimmed);
  });

  if (queue)
    return (
      <Searching
        queue={queue}
        profile={(queue.mode ?? playMode) === 'ranked' ? profile : null}
        loadout={profile?.loadout}
        onCancel={() => store.cancelFind()}
      />
    );

  return (
    <main className="page page--play">
      {/* One line, set large. The two cards below already say what each mode
          costs and what it gives; an eyebrow and a lede above them were three
          sizes of small grey text competing with the only button that matters. */}
      <header className="page__head">
        <h1 className="page__title display">{tr('Your next move.')}</h1>
      </header>

      {needsName && (
        <div className="field play__name">
          <label htmlFor={nameId}>{tr(profile?.name ? 'Play as' : 'Your name')}</label>
          <input
            id={nameId}
            ref={nameRef}
            className="input"
            value={name}
            maxLength={MAX_NAME_LENGTH}
            autoComplete="nickname"
            placeholder={tr('Who are you?')}
            onChange={(e) => {
              setName(e.target.value);
              store.clearJoinError();
            }}
            onKeyDown={(e) => e.key === 'Enter' && (mode === 'code' ? join() : find())}
          />
          {touched && !nameOk && (
            <p className="error-text">{tr('Pick a name so your opponent knows who won.')}</p>
          )}
        </div>
      )}

      {recoverable && (
        <section className="resume panel">
          <div>
            <span className="eyebrow">{tr('Unfinished business')}</span>
            <p>
              {tr('This browser held a seat in room ')}
              <strong className="mono">{invitedCode}</strong>
              {tr(' as ')}
              <strong>{recoverable.name}</strong>
            </p>
          </div>
          <button
            className="btn btn--primary"
            disabled={busy}
            onClick={() => invitedCode && store.recoverSession(invitedCode)}
          >
            {tr('Take that seat back')}
          </button>
        </section>
      )}

      <ModePicker
        value={profile ? playMode : 'casual'}
        onChange={chooseMode}
        canRank={Boolean(profile)}
        disabled={busy}
      />

      <div className="play__grid">
        <section className="play__primary plate">
          <h2 className="display">
            <Radar size={20} aria-hidden="true" />
            {tr(
              playMode === 'ranked' && profile
                ? 'Find someone your size.'
                : 'Find your next rival.',
            )}
          </h2>
          <button className="playbutton" onClick={find} disabled={busy}>
            <Swords size={24} strokeWidth={2.4} aria-hidden="true" />
            <span>{tr(joining ? 'One moment…' : 'Find an opponent')}</span>
            <ArrowRight size={20} aria-hidden="true" />
          </button>
        </section>

        <section className="panel play__friend">
          <div className="panel__head">
            <h2>
              <Users size={18} aria-hidden="true" />
              {tr('Play a friend')}
            </h2>
            <span className="badge">{tr('No rating')}</span>
          </div>
          {mode === 'pick' ? (
            <>
              <div className="play__actions">
                <button className="btn btn--block" onClick={open} disabled={busy}>
                  {tr(joining ? 'Opening a room…' : 'Open a room')}
                </button>
                <button
                  className="btn btn--ghost btn--block"
                  onClick={() => setMode('code')}
                  disabled={busy}
                >
                  <Link2 size={15} aria-hidden="true" />
                  {tr('I have a code')}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="field">
                <label htmlFor={codeId}>{tr('Room code')}</label>
                <input
                  id={codeId}
                  className="input input--code"
                  value={code}
                  inputMode="text"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder={tr('ABCDE')}
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
                  onKeyDown={(e) => e.key === 'Enter' && join()}
                />
              </div>
              {/* A specific answer beats live validation guessing at one. */}
              {lookupNote && !error && (
                <p className={`lookup lookup--${lookup.state}`} role="status" aria-live="polite">
                  {tr(lookupNote)}
                </p>
              )}
              <div className="play__actions">
                <button
                  className="btn btn--primary btn--block"
                  onClick={join}
                  disabled={busy || !isValidRoomCode(code) || lookup.state === 'full'}
                >
                  {tr(joining ? 'Joining…' : 'Join the battle')}
                </button>
                <button
                  className="btn btn--ghost btn--block"
                  onClick={() => setMode('pick')}
                  disabled={busy}
                >
                  {tr('Back')}
                </button>
              </div>
            </>
          )}
        </section>
      </div>

      {error && (
        <p className="error-text" role="alert">
          {tr(error)}
        </p>
      )}
      {offline && (
        <p className="error-text" role="status">
          <WifiOff size={14} />
          {tr('Can’t reach the arena. Retrying…')}
        </p>
      )}
    </main>
  );
}

/**
 * The wait.
 *
 * An indeterminate spinner says only that the page has not frozen. A position,
 * a head count and a clock say whether to keep waiting, which is the actual
 * question. The empty seat opposite is deliberate: it is the shape the match
 * found screen will fill, so the wait is already pointing at the duel.
 */
function Searching({
  queue,
  profile,
  loadout,
  onCancel,
}: {
  queue: QueueState;
  profile: PublicProfile | null;
  loadout: PublicProfile['loadout'];
  onCancel: () => void;
}) {
  useUiPreferences();
  const now = useNow(1_000);
  const seconds = Math.max(0, Math.floor((now - queue.since) / 1000));
  const alone = queue.waiting <= 1;

  return (
    <main className="page page--searching">
      <section className="searching">
        <span className="eyebrow searching__state">
          <i aria-hidden="true" />
          {tr(queue.mode === 'ranked' ? 'Ranked queue' : 'Quick play queue')}
        </span>
        <h1 className="searching__title display">
          {tr(alone ? 'Holding a seat for you.' : 'Finding somebody your size.')}
        </h1>

        <div className="searching__duel">
          <div className="searching__side">
            <Hero loadout={loadout} size={200} label={tr('Your hero')} />
            <strong>{tr('You')}</strong>
          </div>
          <div className="searching__radar" aria-hidden="true">
            <i />
            <i />
            <i />
            <span>{tr('VS')}</span>
          </div>
          <div className="searching__side searching__side--them">
            <div className="searching__unknown" aria-hidden="true">
              <span>{'?'}</span>
            </div>
            <strong>{tr('Searching…')}</strong>
          </div>
        </div>

        <dl className="searching__stats">
          <div>
            <dt>{tr('In the queue')}</dt>
            <dd className="num">{queue.waiting}</dd>
          </div>
          <div>
            <dt>{tr('Your place')}</dt>
            <dd className="num">{queue.position || '—'}</dd>
          </div>
          <div>
            <dt>{tr('Waiting')}</dt>
            <dd className="num">
              {Math.floor(seconds / 60)}
              {':'}
              {String(seconds % 60).padStart(2, '0')}
            </dd>
          </div>
        </dl>

        <p className="searching__body dim" role="status">
          {tr(
            alone
              ? 'You are first in line. The moment somebody else presses battle, you are in.'
              : queue.mode === 'ranked' ? 'The skill range widens while you wait. A match needs another available player.' : 'Matching you with the next available player.',
          )}
        </p>

        {profile && profile.matchesPlayed > 0 && (
          <p className="searching__rank">
            {tr('Matching around')}
            <RankBadge rating={profile.rating} placed={isPlaced(profile.matchesPlayed)} size="sm" />
          </p>
        )}

        <button className="btn btn--lg" onClick={onCancel}>
          <X size={17} aria-hidden="true" />
          {tr('Stop looking')}
        </button>

        {seconds >= 30 && (
          <p className="searching__tip">
            {tr(
              'Quiet arena? Cancel and open a private room — a friend with the link can join in seconds.',
            )}
          </p>
        )}
      </section>
    </main>
  );
}
