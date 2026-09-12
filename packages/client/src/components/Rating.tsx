import { memo } from 'react';
import {
  STARTING_RATING,
  isPlaced,
  nextTier,
  ratingChange,
  tierFor,
  type MatchRecord,
  type PublicProfile,
  type RatingDelta,
} from '@battle/shared';

/**
 * A rating and what it did, in the smallest space that still means something.
 *
 * The number on its own is furniture. The change is the part anybody actually
 * looks at, so it gets the colour and the sign, and it is only rendered when
 * there is one — a zero delta dressed up as news is worse than no news.
 */
export const RatingLine = memo(function RatingLine({
  profile,
  delta,
}: {
  profile: PublicProfile | undefined;
  delta: RatingDelta | undefined;
}) {
  if (!profile) return null;
  const rating = delta?.after ?? profile.rating;
  const placed = isPlaced(profile.matchesPlayed);

  return (
    <p className="ratingline">
      <span className="ratingline__value mono">{rating}</span>
      {delta && delta.change !== 0 && (
        <span className={`ratingline__delta ${delta.change > 0 ? 'is-up' : 'is-down'}`}>
          {delta.change > 0 ? '+' : ''}
          {delta.change}
        </span>
      )}
      <span className="ratingline__tier">{placed ? tierFor(rating).name : 'Placing'}</span>
    </p>
  );
});

/**
 * What this match is worth, before it is played.
 *
 * The same function the server will use afterwards, which is the only reason
 * it is safe to show: a preview that disagrees with the result would be worse
 * than no preview at all. Placement ratings move so fast that quoting a number
 * for them would be misleading, so those are left unquoted.
 */
export const Stakes = memo(function Stakes({
  you,
  them,
}: {
  you: PublicProfile | undefined;
  them: PublicProfile | undefined;
}) {
  if (!you || !them) return null;
  if (!isPlaced(you.matchesPlayed) || !isPlaced(them.matchesPlayed)) {
    // "Counts double" would be a nice line and a false one: placement K is 40
    // against a settled 24, which is not double anything.
    return <p className="stakes dim">Still placing — results move you faster than they will later.</p>;
  }

  const win = ratingChange(
    { rating: you.rating, matchesPlayed: you.matchesPlayed },
    { rating: them.rating, matchesPlayed: them.matchesPlayed },
    'win',
  );
  const loss = ratingChange(
    { rating: you.rating, matchesPlayed: you.matchesPlayed },
    { rating: them.rating, matchesPlayed: them.matchesPlayed },
    'loss',
  );

  return (
    <p className="stakes">
      <span className="stakes__label">On the line</span>
      <span className="stakes__win">+{win}</span>
      <span className="stakes__sep">/</span>
      <span className="stakes__loss">{loss}</span>
    </p>
  );
});

function outcomeClass(record: MatchRecord): string {
  return record.result === 'win' ? 'is-win' : record.result === 'loss' ? 'is-loss' : 'is-draw';
}

/**
 * Your card: where you are, what it took, and how far the next rung is.
 *
 * Only ever your own — the server sends nobody else's history, because ten of
 * somebody else's matches is a stalking tool rather than a scoreboard.
 */
export function ProfileCard({ profile }: { profile: PublicProfile | undefined }) {
  if (!profile) return null;

  const placed = isPlaced(profile.matchesPlayed);
  const tier = tierFor(profile.rating);
  const next = nextTier(profile.rating);
  const history = profile.history ?? [];

  return (
    <section className="profile" aria-label="Your record">
      <div className="profile__head">
        <div>
          <p className="eyebrow">{placed ? 'Your rank' : 'Placing you'}</p>
          <h3 className="profile__tier display">{placed ? tier.name : 'Unranked'}</h3>
          <p className="profile__blurb dim">
            {placed
              ? tier.blurb
              : `${profile.matchesPlayed} played. A few more and this number means something.`}
          </p>
        </div>
        <p className="profile__rating display">{profile.rating}</p>
      </div>

      {placed && next && (
        <p className="profile__next dim">
          {next.pointsAway} to {next.tier.name}.
        </p>
      )}

      <dl className="profile__stats">
        <div>
          <dt>Played</dt>
          <dd className="mono">{profile.matchesPlayed}</dd>
        </div>
        <div>
          <dt>Won</dt>
          <dd className="mono">{profile.wins}</dd>
        </div>
        <div>
          <dt>Lost</dt>
          <dd className="mono">{profile.losses}</dd>
        </div>
        <div>
          <dt>Streak</dt>
          <dd className="mono">{profile.streak > 0 ? `${profile.streak}W` : '—'}</dd>
        </div>
        <div>
          <dt>Best</dt>
          <dd className="mono">{profile.bestStreak > 0 ? `${profile.bestStreak}W` : '—'}</dd>
        </div>
      </dl>

      {history.length > 0 && (
        <ol className="profile__history" aria-label="Recent matches">
          {history.map((record) => (
            <li key={record.at} className={`profile__row ${outcomeClass(record)}`}>
              <span className="profile__result">{record.result}</span>
              <span className="profile__opponent">{record.opponentName || 'Someone'}</span>
              <span className="profile__score mono">
                {record.yourScore}&ndash;{record.theirScore}
              </span>
              <span className="profile__move mono">
                {record.ratingAfter - record.ratingBefore > 0 ? '+' : ''}
                {record.ratingAfter - record.ratingBefore}
              </span>
            </li>
          ))}
        </ol>
      )}

      {history.length === 0 && profile.matchesPlayed === 0 && (
        <p className="profile__empty dim">
          Everybody starts at {STARTING_RATING}. Win a match and it moves.
        </p>
      )}
    </section>
  );
}
