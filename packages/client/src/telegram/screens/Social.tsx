import { useEffect, useState } from 'react';
import { Gift, Link2, ShieldOff, UserMinus, UserPlus, Users } from 'lucide-react';
import type { TelegramMe, TelegramPlayerCard, TelegramSocialView } from '@battle/shared';
import { tr } from '../../i18n/index.js';
import { api, ApiError } from '../api.js';
import { Empty, Failed, Loading, PlayerRow, Section } from '../ui.jsx';
import { haptics, shareLink } from '../sdk.js';
import type { View } from '../router.js';

const REASONS = [
  { id: 'cheating', label: 'Cheating' },
  { id: 'abuse', label: 'Abuse' },
  { id: 'inappropriate', label: 'Inappropriate behaviour' },
  { id: 'spam', label: 'Spam' },
  { id: 'other', label: 'Something else' },
];

/**
 * People.
 *
 * Three lists, in the order they are useful: the friends you chose, the people
 * you have just played — which is where a friend usually comes from — and the
 * ones you have blocked, kept visible so blocking is reversible rather than a
 * decision that disappears.
 */
export function SocialScreen({
  me,
  onGo,
}: {
  me: TelegramMe;
  onGo: (view: View) => void;
}) {
  const [data, setData] = useState<TelegramSocialView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = () => {
    setError(null);
    api
      .social()
      .then(setData)
      .catch((failure: unknown) =>
        setError(failure instanceof ApiError ? failure.message : tr('Could not load your people.')),
      );
  };
  useEffect(load, []);


  if (error) return <Failed message={error} onRetry={load} />;
  if (!data) return <Loading label="Finding your people…" />;

  return (
    <>
      <div className="plate tg-hero">
        <h1>{tr('Bring someone in')}</h1>
        <p>
          {tr(
            'Challenge your friends to a real-time duel. When they finish their first match you both get Battle coins.',
          )}
        </p>
        <button
          type="button"
          className="btn btn--primary btn--block"
          onClick={() => {
            haptics.tap();
            shareLink(me.referralLink, me.referralShareText);
          }}
        >
          <Gift size={16} aria-hidden />
          {tr('Share your invite')}
        </button>
        <button className="btn btn--block" disabled={creating} onClick={async () => {
          setCreating(true);
          try {
            const challenge = await api.createChallenge();
            haptics.result('success');
            onGo({ k: 'challenge', code: challenge.code });
          } catch (failure) {
            setError(failure instanceof ApiError ? failure.message : tr('Could not create that duel.'));
          } finally { setCreating(false); }
        }}><Link2 size={16} />{tr(creating ? 'Creating…' : 'Challenge a friend')}</button>
        <div className="tg-hero__rank">
          <span>{tr('Invited')}</span>
          <b>
            {me.referrals.activated}
            {tr(' of ')}
            {me.referrals.joined}
            {tr(' have played')}
          </b>
        </div>
      </div>

      {data.incoming.length > 0 && (
        <Section title="Challenges for you">
          {data.incoming.map((challenge) => (
            <PlayerRow
              key={challenge.code}
              player={challenge.host}
              detail={tr('wants to duel you')}
              end={<span className="tg-row__end"><b>{tr('Open')}</b></span>}
              onOpen={() => onGo({ k: 'challenge', code: challenge.code })}
            />
          ))}
        </Section>
      )}

      {data.outgoing.length > 0 && (
        <Section title="Waiting on an answer">
          {data.outgoing.map((challenge) => (
            <div key={challenge.code} className="tg-row tg-row--flat">
              <Link2 size={18} aria-hidden />
              <span className="tg-row__main">
                <strong>{challenge.guest ? challenge.guest.name : tr('Open challenge')}</strong>
                <span>
                  {challenge.guest ? tr('accepted — enter the duel') : tr('nobody has accepted yet')}
                </span>
              </span>
              <button
                type="button"
                className="btn btn--sm"
                onClick={() =>
                  challenge.guest
                    ? onGo({ k: 'challenge', code: challenge.code })
                    : shareLink(challenge.link, challenge.shareText)
                }
              >
                {tr(challenge.guest ? 'Open' : 'Share')}
              </button>
            </div>
          ))}
        </Section>
      )}

      <Section title="Friends">
        {data.friends.length === 0 ? (
          <Empty
            title="No friends yet"
            body="Add somebody after a duel and their rating shows up on your board."
            action="Invite a friend"
            onAction={() => shareLink(me.referralLink, me.referralShareText)}
          />
        ) : (
          data.friends.map((friend) => (
            <PlayerRow
              key={friend.ref}
              player={friend}
              onOpen={() => onGo({ k: 'player', ref: friend.ref })}
            />
          ))
        )}
      </Section>

      {data.recentOpponents.length > 0 && (
        <Section title="Recently played">
          {data.recentOpponents.map((opponent) => (
            <PlayerRow
              key={opponent.ref}
              player={opponent}
              onOpen={() => onGo({ k: 'player', ref: opponent.ref })}
            />
          ))}
        </Section>
      )}

      {data.blocked.length > 0 && (
        <Section title="Blocked">
          {data.blocked.map((blocked) => (
            <PlayerRow
              key={blocked.ref}
              player={blocked}
              detail={tr('blocked')}
              end={
                <button
                  type="button"
                  className="btn btn--sm btn--ghost"
                  onClick={() => void api.block(blocked.ref, 'unblock').then(setData)}
                >
                  {tr('Unblock')}
                </button>
              }
            />
          ))}
        </Section>
      )}
    </>
  );
}

/**
 * Somebody else's card.
 *
 * Everything you can do about another person is here and nowhere else: add
 * them, block them, report them. Keeping it in one place is what stops "report"
 * ending up as an easily-mistapped icon beside a scoreboard row.
 */
export function PlayerScreen({ playerRef, onBack }: { playerRef: string; onBack: () => void }) {
  const [state, setState] = useState<{
    player: TelegramPlayerCard;
    friend: boolean;
    blocked: boolean;
    you: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const [note, setNote] = useState('');
  const [filed, setFiled] = useState(false);

  const load = () => {
    setError(null);
    api
      .player(playerRef)
      .then(setState)
      .catch((failure: unknown) =>
        setError(failure instanceof ApiError ? failure.message : tr('No such player.')),
      );
  };
  useEffect(load, [playerRef]);

  if (error) return <Failed message={error} onRetry={load} />;
  if (!state) return <Loading />;

  const { player } = state;

  return (
    <>
      <div className="plate tg-hero" style={{ textAlign: 'center' }}>
        <h1>{player.name}</h1>
        <p>
          {player.rank} · {player.rating} {tr('rating')}
        </p>
        <div className="stats">
          <div className="stat">
            <span>{tr('Battles')}</span>
            <strong>{player.matchesPlayed}</strong>
          </div>
          <div className="stat">
            <span>{tr('Wins')}</span>
            <strong>{player.wins}</strong>
          </div>
          <div className="stat">
            <span>{tr('Level')}</span>
            <strong>{player.level}</strong>
          </div>
          <div className="stat">
            <span>{tr('Streak')}</span>
            <strong>{player.streak}</strong>
          </div>
        </div>
      </div>

      {!state.you && !state.blocked && (
        <button
          type="button"
          className="btn btn--block"
          onClick={() =>
            void api
              .friend(playerRef, state.friend ? 'remove' : 'add')
              .then(() => setState({ ...state, friend: !state.friend }))
          }
        >
          {state.friend ? <UserMinus size={16} aria-hidden /> : <UserPlus size={16} aria-hidden />}
          {tr(state.friend ? 'Remove friend' : 'Add friend')}
        </button>
      )}

      {!state.you && (
        <button
          type="button"
          className="btn btn--block btn--ghost"
          onClick={() =>
            void api
              .block(playerRef, state.blocked ? 'unblock' : 'block')
              .then(() => setState({ ...state, blocked: !state.blocked, friend: false }))
          }
        >
          <ShieldOff size={16} aria-hidden />
          {tr(state.blocked ? 'Unblock' : 'Block this player')}
        </button>
      )}

      {!state.you && !filed && (
        <Section title="Something wrong?">
          {reporting ? (
            <>
              <label className="field">
                <span>{tr('What happened?')}</span>
                <input
                  className="input"
                  value={note}
                  maxLength={200}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder={tr('Optional. A sentence is plenty.')}
                />
              </label>
              {REASONS.map((reason) => (
                <button
                  key={reason.id}
                  type="button"
                  className="btn btn--block btn--sm"
                  onClick={() =>
                    void api.report(playerRef, reason.id, note || undefined).then(() => {
                      setFiled(true);
                      haptics.result('success');
                    })
                  }
                >
                  {tr(reason.label)}
                </button>
              ))}
              <button type="button" className="btn btn--ghost btn--sm btn--block" onClick={() => setReporting(false)}>
                {tr('Never mind')}
              </button>
            </>
          ) : (
            <button type="button" className="btn btn--ghost btn--block" onClick={() => setReporting(true)}>
              {tr('Report this player')}
            </button>
          )}
        </Section>
      )}

      {filed && (
        <p className="dim" style={{ textAlign: 'center' }}>
          {tr('Reported. A person reads every one of these; nobody is banned automatically.')}
        </p>
      )}

      <button type="button" className="btn btn--ghost btn--block" onClick={onBack}>
        <Users size={16} aria-hidden />
        {tr('Back')}
      </button>
    </>
  );
}
