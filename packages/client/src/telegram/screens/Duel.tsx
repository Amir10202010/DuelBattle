import { useEffect, useState } from 'react';
import { Link2, Swords } from 'lucide-react';
import type { TelegramChallengeView } from '@battle/shared';
import { tr } from '../../i18n/index.js';
import { Empty, Failed } from '../ui.jsx';
import { api, ApiError } from '../api.js';
import { haptics, shareLink } from '../sdk.js';

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
