import { useEffect, useState } from 'react';
import { Link2, Radar, Swords, Users, X } from 'lucide-react';
import type { TelegramChallengeView, TelegramHome } from '@battle/shared';
import { tr } from '../../i18n/index.js';
import type { QueueState } from '../../net/store.js';
import { Empty, Failed, PlayerRow, Section } from '../ui.jsx';
import { api, ApiError } from '../api.js';
import { haptics, shareLink } from '../sdk.js';
import type { View } from '../router.js';

/**
 * Where a duel starts.
 *
 * Two ways in, in the order they are worth offering. Matchmaking is first and
 * loud, because it is the one that works when nobody you know is awake.
 * Challenging a friend is second, because it needs a friend — and it is the one
 * that brings somebody new into the game, so it is a real button rather than a
 * line of small print.
 *
 * The searching state says something true — how many people are waiting and
 * where you are among them — rather than spinning a wheel at somebody.
 */
export function DuelScreen({
  home,
  queue,
  offline,
  onFind,
  onCancel,
  onGo,
  onRefresh,
}: {
  home: TelegramHome;
  queue: QueueState | null;
  offline: boolean;
  onFind: () => void;
  onCancel: () => void;
  onGo: (view: View) => void;
  onRefresh: () => void;
}) {
  const [challenge, setChallenge] = useState<TelegramChallengeView | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waited, setWaited] = useState(0);

  useEffect(() => {
    if (!queue) {
      setWaited(0);
      return;
    }
    const timer = window.setInterval(
      () => setWaited(Math.floor((Date.now() - queue.since) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [queue]);

  const createChallenge = async () => {
    setCreating(true);
    setError(null);
    try {
      const created = await api.createChallenge();
      setChallenge(created);
      haptics.result('success');
      shareLink(created.link, created.shareText);
      onRefresh();
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : tr('Could not create that duel.'));
      haptics.result('error');
    } finally {
      setCreating(false);
    }
  };

  if (queue) {
    return (
      <div className="tg-duel">
        <div className="tg-duel__state">
          <span className="tg-duel__pulse">
            <Radar size={30} aria-hidden />
          </span>
          <h2>{tr('Finding your opponent…')}</h2>
          <p>
            {queue.waiting > 1
              ? tr(`${queue.waiting} players searching · you are #${queue.position}`)
              : tr('You are first in line. This takes longer when the lobby is quiet.')}
          </p>
          <p className="dim num">
            {String(Math.floor(waited / 60)).padStart(2, '0')}:
            {String(waited % 60).padStart(2, '0')}
          </p>
        </div>

        {waited > 25 && (
          <p className="dim" style={{ fontSize: 'var(--t-sm)' }}>
            {tr('Nobody nearby yet. The search widens the longer you wait.')}
          </p>
        )}

        <button type="button" className="btn btn--ghost btn--block" onClick={onCancel}>
          <X size={16} aria-hidden />
          {tr('Stop searching')}
        </button>

        <button type="button" className="btn btn--block" onClick={createChallenge} disabled={creating}>
          <Users size={16} aria-hidden />
          {tr('Challenge a friend instead')}
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="plate tg-hero">
        <h1>{tr('Start a duel')}</h1>
        <p>
          {tr(
            'Both players get the same challenge. Find it in the room around you and show it first.',
          )}
        </p>
        <button
          type="button"
          className="btn btn--primary btn--lg btn--block"
          disabled={offline}
          onClick={() => {
            haptics.tap('medium');
            onFind();
          }}
        >
          <Swords size={18} aria-hidden />
          {tr('Find an opponent')}
        </button>
        {offline && <p className="error-text">{tr('No connection to the game server.')}</p>}
        <p className="dim" style={{ fontSize: 'var(--t-sm)', margin: 0 }}>
          {tr('Ranked. Moves your rating, pays XP and Battle coins.')}
        </p>
      </div>

      <Section title="Play a friend">
        {challenge ? (
          <div className="tg-quest is-done">
            <div className="tg-quest__top">
              <div>
                <strong>{tr('Challenge sent')}</strong>
                <span>{tr('It stays open for a day. They can accept whenever they like.')}</span>
              </div>
            </div>
            <button
              type="button"
              className="btn btn--block btn--sm"
              onClick={() => shareLink(challenge.link, challenge.shareText)}
            >
              <Link2 size={15} aria-hidden />
              {tr('Share it again')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn--block"
            onClick={createChallenge}
            disabled={creating}
          >
            <Users size={16} aria-hidden />
            {creating ? tr('Creating…') : tr('Challenge a friend')}
          </button>
        )}
        {error && <p className="error-text">{error}</p>}
        <p className="dim" style={{ fontSize: 'var(--t-sm)' }}>
          {tr('Friendly duels do not move your rating. Everything else counts.')}
        </p>
      </Section>

      {home.incoming.length > 0 && (
        <Section title="Challenges waiting">
          {home.incoming.map((incoming) => (
            <PlayerRow
              key={incoming.code}
              player={incoming.host}
              detail={tr('wants to duel you')}
              end={<span className="tg-row__end"><b>{tr('Open')}</b></span>}
              onOpen={() => onGo({ k: 'challenge', code: incoming.code })}
            />
          ))}
        </Section>
      )}

      <Section title="Today's quests" action="See all" onAction={() => onGo({ k: 'quests' })}>
        {home.quests.quests.map((quest) => (
          <div key={quest.id} className={`tg-quest ${quest.done ? 'is-done' : ''}`}>
            <div className="tg-quest__top">
              <div>
                <strong>{tr(quest.title)}</strong>
                <span>
                  {quest.progress}/{quest.target} · {tr(quest.description)}
                </span>
              </div>
              <span className="tg-quest__reward">
                {quest.claimed ? tr('claimed') : `+${quest.reward}`}
              </span>
            </div>
          </div>
        ))}
      </Section>
    </>
  );
}

/** The accept screen a `duel_` deep link lands on. */
export function ChallengeScreen({
  code,
  onEnterRoom,
  onBack,
}: {
  code: string;
  onEnterRoom: (roomCode: string) => void;
  onBack: () => void;
}) {
  const [challenge, setChallenge] = useState<TelegramChallengeView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setError(null);
    api
      .challenge(code)
      .then(setChallenge)
      .catch((failure: unknown) =>
        setError(failure instanceof ApiError ? failure.message : tr('That duel is gone.')),
      );
  };
  useEffect(load, [code]);

  const act = async (run: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await run();
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : tr('That did not work.'));
      haptics.result('error');
    } finally {
      setBusy(false);
    }
  };

  if (error && !challenge) return <Failed message={error} onRetry={load} />;
  if (!challenge) return <Empty title="Opening the challenge…" body="One moment." />;

  const mine = challenge.mine;
  const accepted = challenge.status === 'accepted' || challenge.status === 'playing';

  return (
    <>
      <div className="plate tg-hero" style={{ textAlign: 'center' }}>
        <h1>
          {mine
            ? tr('Your challenge')
            : tr(`${challenge.host.name} challenged you`)}
        </h1>
        <div className="tg-versus">
          <span className="tg-versus__side">
            <strong>{challenge.host.name}</strong>
            <span>
              {challenge.host.rank} · {challenge.host.rating}
            </span>
          </span>
          <span className="tg-versus__vs">{tr('VS')}</span>
          <span className="tg-versus__side">
            <strong>{challenge.guest ? challenge.guest.name : tr('Waiting…')}</strong>
            <span>
              {challenge.guest ? `${challenge.guest.rank} · ${challenge.guest.rating}` : tr('open seat')}
            </span>
          </span>
        </div>

        {challenge.status === 'expired' || challenge.status === 'declined' ? (
          <p className="dim">{tr('This challenge is closed. Ask for a new one.')}</p>
        ) : accepted ? (
          <button
            type="button"
            className="btn btn--primary btn--lg btn--block"
            disabled={busy}
            onClick={() =>
              void act(async () => {
                const { roomCode } = await api.challengeRoom(challenge.code);
                haptics.tap('heavy');
                onEnterRoom(roomCode);
              })
            }
          >
            <Swords size={18} aria-hidden />
            {tr('Enter the duel')}
          </button>
        ) : mine ? (
          <>
            <p className="dim">{tr('Waiting for somebody to accept. Share it again?')}</p>
            <button
              type="button"
              className="btn btn--block"
              onClick={() => shareLink(challenge.link, challenge.shareText)}
            >
              <Link2 size={16} aria-hidden />
              {tr('Share')}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn btn--primary btn--lg btn--block"
            disabled={busy}
            onClick={() =>
              void act(async () => {
                const updated = await api.acceptChallenge(challenge.code);
                setChallenge(updated);
                haptics.result('success');
              })
            }
          >
            {busy ? tr('Accepting…') : tr('Accept the duel')}
          </button>
        )}
        {error && <p className="error-text">{error}</p>}
      </div>

      {!mine && !accepted && challenge.status === 'pending' && (
        <button
          type="button"
          className="btn btn--ghost btn--block"
          disabled={busy}
          onClick={() =>
            void act(async () => {
              await api.declineChallenge(challenge.code);
              onBack();
            })
          }
        >
          {tr('Not now')}
        </button>
      )}
      {mine && challenge.status === 'pending' && (
        <button
          type="button"
          className="btn btn--ghost btn--block"
          disabled={busy}
          onClick={() =>
            void act(async () => {
              await api.cancelChallenge(challenge.code);
              onBack();
            })
          }
        >
          {tr('Cancel this challenge')}
        </button>
      )}
    </>
  );
}
