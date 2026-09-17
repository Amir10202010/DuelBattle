import { tr, useUiPreferences } from '../i18n/index.js';
import { memo } from 'react';
import {
  isPlaced,
  ratingChange,
  tierFor,
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
  useUiPreferences();
  if (!profile) return null;
  const rating = delta?.after ?? profile.rating;
  const placed = isPlaced(profile.matchesPlayed);

  return (
    <p className="ratingline">
      <span className="ratingline__value mono">{tr(rating)}</span>
      {delta && delta.change !== 0 && (
        <span className={`ratingline__delta ${delta.change > 0 ? 'is-up' : 'is-down'}`}>
          {tr(delta.change > 0 ? '+' : '')}
          {tr(delta.change)}
        </span>
      )}
      <span className="ratingline__tier">{tr(placed ? tierFor(rating).name : 'Placing')}</span>
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
  useUiPreferences();
  if (!you || !them) return null;
  if (!isPlaced(you.matchesPlayed) || !isPlaced(them.matchesPlayed)) {
    // "Counts double" would be a nice line and a false one: placement K is 40
    // against a settled 24, which is not double anything.
    return (
      <p className="stakes dim">
        {tr('Placement in progress. Both players share the same rating stakes.')}
      </p>
    );
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
      <span className="stakes__label">{tr('On the line')}</span>
      <span className="stakes__win">
        {'+'}
        {tr(win)}
      </span>
      <span className="stakes__sep">{'/'}</span>
      <span className="stakes__loss">{tr(loss)}</span>
    </p>
  );
});
