import {
  DIVISIONS_PER_TIER,
  PLACEMENT_MATCHES,
  STARTING_RATING,
  TIERS,
  isPlaced,
  rankFor,
  demotionRisk,
  nextRank,
  type PublicProfile,
} from '@battle/shared';

/**
 * The ladder, explained once so it never has to be explained again.
 *
 * A progression system nobody can read is a number that goes up. What makes
 * this one a ladder is that a player can see every rung, see which one they are
 * on, and know exactly what moves them between two of them — including
 * downwards, which is the half most games are coy about and the half that makes
 * the rest of it mean anything.
 */
export function Ranks({ profile }: { profile: PublicProfile | null }) {
  const rating = profile?.rating ?? STARTING_RATING;
  const placed = profile ? isPlaced(profile.matchesPlayed) : false;
  const here = rankFor(rating);
  const up = nextRank(rating);
  const down = demotionRisk(rating);

  return (
    <main className="page page--ranks">
      <header className="page__head">
        <p className="eyebrow">Ranks</p>
        <h1 className="page__title display">Eight rungs, three steps each.</h1>
        <p className="page__lede">
          Everybody starts at {STARTING_RATING}, partway up rather than at the bottom — so there is
          somewhere to fall as well as somewhere to climb. Win and the number moves up, lose and it
          moves down, and the rung you are standing on is simply the one your rating clears.
        </p>
      </header>

      {profile && (
        <section className="youare">
          <p className="eyebrow">You are here</p>
          <p className="youare__rank display">{placed ? here.label : 'Still placing'}</p>
          <p className="youare__rating mono">{rating}</p>
          <div className="climb__track">
            <div className="climb__fill" style={{ width: `${Math.round(here.progress * 100)}%` }} />
          </div>
          <p className="youare__note dim">
            {!placed
              ? `${Math.max(0, PLACEMENT_MATCHES - profile.matchesPlayed)} more matches and the number stops being a guess.`
              : up
                ? `${up.pointsAway} points to ${up.rank.label}${down ? `, ${down.pointsAway} above dropping to ${down.rank.label}` : ''}.`
                : 'There is nothing above this.'}
          </p>
        </section>
      )}

      <ol className="ladder" aria-label="The ranks">
        {[...TIERS].reverse().map((tier, index) => {
          const top = index === 0;
          const standing = tier.name === here.tier.name && placed;
          const next = TIERS[TIERS.indexOf(tier) + 1];
          return (
            <li key={tier.name} className={`rung ${standing ? 'is-here' : ''} ${top ? 'is-apex' : ''}`}>
              <span className="rung__band" aria-hidden="true" />
              <div className="rung__body">
                <h2 className="rung__name">{tier.name}</h2>
                <p className="rung__range mono">
                  {tier.floor}
                  {next ? `–${next.floor - 1}` : '+'}
                </p>
                <p className="rung__blurb dim">{tier.blurb}</p>
              </div>
              <span className="rung__divisions">
                {top ? 'no divisions' : `${DIVISIONS_PER_TIER} divisions`}
              </span>
              {standing && <span className="rung__you">you</span>}
            </li>
          );
        })}
      </ol>

      <section className="explain">
        <article>
          <h2 className="explain__title">How the number moves</h2>
          <p>
            Ordinary Elo, and it is zero-sum: whatever you take, your opponent loses. Beating
            somebody far below you is worth almost nothing and losing to them is expensive, which is
            what stops the ladder rewarding anybody for picking on beginners. An upset pays properly.
          </p>
        </article>
        <article>
          <h2 className="explain__title">Placement</h2>
          <p>
            The first {PLACEMENT_MATCHES} matches move you roughly twice as fast, so finding your
            level takes an evening rather than a month. Until they are done your rating is labelled
            a guess and you are not on the leaderboard.
          </p>
        </article>
        <article>
          <h2 className="explain__title">Promotion and demotion</h2>
          <p>
            There are no hidden shields and no grace matches. Cross the line going up and you are
            promoted the same match; cross it going down and you are demoted the same match. What
            the game owes you instead is warning, which is why the drop line is on your profile
            before you play, not after.
          </p>
        </article>
        <article>
          <h2 className="explain__title">Which matches count</h2>
          <p>
            Only ones both of you actually played: not abandoned, and both of you answering at least
            half the rounds. Two seats sharing one browser are not recorded at all. A rating you can
            inflate with a second tab is not a rating.
          </p>
        </article>
      </section>
    </main>
  );
}
