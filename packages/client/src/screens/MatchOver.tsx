import { tr, useUiPreferences } from '../i18n/index.js';
import { CoinIcon } from '../components/currency/Coins.jsx';
import { useEffect, useState } from 'react';
import {
  getAchievement,
  getChallenge,
  opponentOf,
  rankFor,
  type MatchRewards,
  type PublicMatchState,
  type PublicProfile,
  type RatingDelta,
  type RoundOutcome,
} from '@battle/shared';
import { Celebration } from '../components/Celebration.jsx';
import { ArrowRight, RotateCcw, Trophy } from 'lucide-react';
import { RatingLine } from '../components/Rating.jsx';
import type { MatchStore } from '../net/store.js';
import { SeriesLine } from '../components/Series.jsx';
import { LevelBar } from '../components/Identity.jsx';
import { RankEmblem, RewardArt } from '../components/GameArt.jsx';
import { sound } from '../media/sound.js';

interface MatchOverProps {
  store: MatchStore;
  match: PublicMatchState;
  youId: string;
  /** `${roundId}:${playerId}` -> JPEG data URL, as collected during the match. */
  evidence: Record<string, string>;
  standings: Record<string, PublicProfile>;
  lastRatings: Record<string, RatingDelta> | null;
  /** What this match paid you. Null when nothing was recorded. */
  rewards: MatchRewards | null;
  onLeave: () => void;
  /** Back out to the queue rather than to a dead room. */
  onFindAnother: () => void;
}

/**
 * Why you lost a round, in two or three words.
 *
 * The full reason is only on screen for the five seconds of the round result,
 * and by the recap it is gone — so a player who lost 3-0 has no way to tell
 * whether they were slower, not detected, or simply voted down every time. That
 * last one is worth being able to see.
 */
function yourOutcome(outcome: RoundOutcome, youId: string): { label: string; kind: string } | null {
  if (outcome.reason === 'verification-unavailable')
    return { label: 'check unavailable', kind: 'missed' };
  if (outcome.winnerId === youId) return null;
  const mine = outcome.perPlayer[youId];
  if (!mine) return { label: 'no answer', kind: 'missed' };

  // A vetoed round has no winner and two explanations: one of you was rejected,
  // and the other one is the reason it counted for nobody.
  if (outcome.reason === 'vetoed') {
    return mine.valid
      ? { label: 'you said no', kind: 'rejected' }
      : { label: 'voted down', kind: 'rejected' };
  }

  if (mine.valid) {
    const theirs = outcome.winnerId ? outcome.perPlayer[outcome.winnerId] : undefined;
    if (mine.elapsedMs != null && theirs?.elapsedMs != null) {
      const behind = (mine.elapsedMs - theirs.elapsedMs) / 1000;
      // Under a twentieth of a second this rounds to "0.0s slower", which reads
      // as a bug to the person who lost by it.
      if (behind < 0.05) return { label: 'photo finish', kind: 'slower' };
      return { label: `${behind.toFixed(1)}s slower`, kind: 'slower' };
    }
    return { label: 'slower', kind: 'slower' };
  }

  const note = mine.note.toLowerCase();
  if (note.includes('rejected')) return { label: 'voted down', kind: 'rejected' };
  if (note.includes('passed')) return { label: 'passed', kind: 'missed' };
  if (note.includes('ran out')) return { label: 'out of time', kind: 'missed' };
  return { label: 'not detected', kind: 'missed' };
}

export function MatchOver({
  store,
  match,
  youId,
  evidence,
  standings,
  lastRatings,
  rewards,
  onLeave,
  onFindAnother,
}: MatchOverProps) {
  useUiPreferences();
  const you = match.players[youId] ?? null;
  const opponent = opponentOf(match, youId);
  const won = match.winnerId === youId;
  const headline =
    match.endReason === 'abandoned'
      ? 'Match ended'
      : !match.winnerId
        ? 'Draw'
        : won
          ? 'Victory!'
          : 'Good game';
  return (
    <main className="over">
      <div className="over__head">
        {won && <Celebration finale />}
        <h1 className={`over__title display ${won ? 'over__title--win' : ''}`}>{tr(headline)}</h1>
        {match.endReason === 'forfeit' && (
          <p className="over__sub dim">{tr(won ? 'Your opponent left.' : 'You left the match.')}</p>
        )}
        <SeriesLine match={match} youId={youId} className="over__series" />
      </div>
      <div className="over__score">
        {match.seats.map((id, seat) => {
          const player = id ? (match.players[id] ?? null) : null;
          return (
            <div
              key={seat}
              className={`over__side over__side--seat${seat} ${id && id === match.winnerId ? 'is-winner' : ''}`}
            >
              <span className="over__name">
                {id && id === match.winnerId && <Trophy size={15} aria-label={tr('Winner')} />}{' '}
                {player?.name ?? '—'}
              </span>
              <span className="over__number display">{player?.score ?? 0}</span>
              {id && match.ranked && (
                <RatingLine profile={standings[id]} delta={lastRatings?.[id] ?? undefined} />
              )}
            </div>
          );
        })}
      </div>
      <div className="over__actions">
        <button
          className="btn btn--primary btn--lg"
          onClick={opponent?.connected ? () => store.rematch() : onFindAnother}
          disabled={Boolean(opponent?.connected && you?.rematchVote)}
        >
          <RotateCcw size={19} aria-hidden="true" />
          {tr(you?.rematchVote && opponent?.connected ? 'Waiting for them…' : 'Play again')}
        </button>
        {opponent?.connected && (
          <button className="btn btn--lg" onClick={onFindAnother}>
            {tr('New opponent')}
            <ArrowRight size={17} aria-hidden="true" />
          </button>
        )}
        <button className="btn btn--ghost" onClick={onLeave}>
          {tr('Done for now')}
        </button>
      </div>
      {opponent?.rematchVote && !you?.rematchVote && (
        <p className="over__nudge" role="status">
          {tr(`${opponent.name} wants a rematch.`)}
        </p>
      )}
      <Payout rewards={rewards} profile={standings[youId]} />
      {!rewards && (
        <div className="unrated-result">
          {match.ranked ? (
            <details>
              <summary>{tr('Rating and XP unchanged')}</summary>
              <p>
                {tr(
                  'This match did not qualify for progression. Verification, participation and rematch limits protect both players.',
                )}
              </p>
            </details>
          ) : (
            <span>{tr('Just for fun · no rating changes')}</span>
          )}
          {!standings[youId] && (
            <p>
              <a className="text-link" href="/register">
                {tr('Unlock ranks and rewards')} →
              </a>
            </p>
          )}
        </div>
      )}
      {match.history.length > 0 && (
        <details className="over-details">
          <summary>
            {tr('Round recap')} · {match.history.length}
          </summary>
          <Filmstrip match={match} youId={youId} evidence={evidence} />
          <ol className="recap" aria-label={tr('Round by round')}>
            {match.history.map((outcome) => {
              const challenge = getChallenge(outcome.challengeId);
              const custom = match.customChallenges.find((c) => c.id === outcome.challengeId);
              const why = yourOutcome(outcome, youId);
              return (
                <li key={outcome.roundNumber} className="recap__row">
                  <span className="recap__num mono">
                    {String(outcome.roundNumber).padStart(2, '0')}
                  </span>
                  <span className="recap__prompt">
                    {custom?.prompt ?? tr(challenge?.prompt ?? outcome.challengeId)}
                  </span>
                  <span
                    className={`recap__winner ${outcome.winnerId === youId ? 'is-you' : ''} ${outcome.winnerId === null ? 'is-draw' : ''}`}
                  >
                    {outcome.winnerId
                      ? (match.players[outcome.winnerId]?.name ?? tr('Unknown'))
                      : tr('Nobody')}
                  </span>
                  <span className={`recap__why ${why ? `is-${why.kind}` : ''}`}>
                    {tr(why?.label ?? 'won it')}
                  </span>
                </li>
              );
            })}
          </ol>
        </details>
      )}
    </main>
  );
}

/**
 * What the match was worth, beyond the score.
 *
 * The rating is on the scoreline above, where it belongs, and it can go down.
 * This is the other half: XP always goes up, a level is a thing you cannot lose,
 * and an award is a sentence about something you actually did. A losing player
 * should still have something true to read here, which is why it renders on a
 * loss exactly as it does on a win.
 */
function Payout({
  rewards,
  profile,
}: {
  rewards: MatchRewards | null;
  profile: PublicProfile | undefined;
}) {
  useUiPreferences();
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (!rewards) return;
    const xpTimer = window.setTimeout(() => {
      setRevealed(true);
      sound.play('xpGain');
    }, 650);
    const rewardTimer = window.setTimeout(() => {
      if (rewards.rankMove === 'promoted') sound.play('rankUp');
      else if (rewards.unlocked.length) sound.play('reward');
    }, 1400);
    return () => {
      window.clearTimeout(xpTimer);
      window.clearTimeout(rewardTimer);
    };
  }, [rewards]);
  if (!rewards || !profile) return null;
  const levelled = rewards.levelAfter > rewards.levelBefore;
  const unlocked = rewards.unlocked
    .map((id) => getAchievement(id))
    .filter((a): a is NonNullable<typeof a> => Boolean(a));

  return (
    <section
      className={`payout ${revealed ? 'is-revealed' : ''}`}
      aria-label={tr('What this match was worth')}
    >
      {rewards.rankMove === 'promoted' && (
        <div className="promotion" role="status">
          <RankEmblem rating={profile.rating} size={100} />
          <div>
            <span className="eyebrow">{tr('Rank up')}</span>
            <h2>{tr(rankFor(profile.rating).label)}</h2>
          </div>
        </div>
      )}
      <div className="payout__head">
        {!!rewards.coins && <span className="coin-counter"><CoinIcon size={28}/><strong>+{rewards.coins}</strong></span>}
        <span className="payout__xp display">
          {'+'}
          {tr(rewards.xp)}
        </span>
        <span className="payout__label">{tr('XP')}</span>
        {levelled && (
          <span className="payout__level">
            {tr('Level ')}
            {tr(rewards.levelAfter)}
          </span>
        )}
        {rewards.rankMove && (
          <span className={`payout__rank is-${rewards.rankMove}`}>
            {tr(rewards.rankMove === 'promoted' ? 'Promoted to' : 'Dropped to')}{' '}
            {tr(rankFor(profile.rating).label)}
          </span>
        )}
      </div>

      <LevelBar xp={revealed ? profile.xp : Math.max(0, profile.xp - rewards.xp)} />
      {!!rewards.dailyBonus && (
        <p className="daily-payout">
          {tr('Daily challenge complete · +')}
          {tr(rewards.dailyBonus)}
          {tr(' XP included')}
        </p>
      )}

      {unlocked.length > 0 && (
        <ul className="payout__awards">
          {unlocked.map((award) => (
            <li
              key={award.id}
              className={`payout__award payout__award--${award.rarity}`}
              title={tr(award.description)}
            >
              <RewardArt group={award.group} rarity={award.rarity} />
              <span className="payout__awardname">{tr(award.name)}</span>

              <span className="payout__awardxp mono">
                {'+'}
                {tr(award.xp)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The story of the match, in the shots that won it.
 *
 * The server only keeps the round it is judging; these are the copies this
 * client was sent as each round resolved. It is the one moment in the game
 * worth looking back at, and a table of prompts is not it.
 */
function Filmstrip({
  match,
  youId,
  evidence,
}: {
  match: PublicMatchState;
  youId: string;
  evidence: Record<string, string>;
}) {
  useUiPreferences();
  const shots = match.history
    .filter((outcome) => outcome.winnerId !== null)
    .map((outcome) => ({
      outcome,
      image: evidence[`${outcome.roundId}:${outcome.winnerId}`],
      challenge: getChallenge(outcome.challengeId) ?? null,
      custom: match.customChallenges.find((c) => c.id === outcome.challengeId) ?? null,
    }))
    .filter((shot) => Boolean(shot.image));

  if (shots.length === 0) return null;

  return (
    <ol className="filmstrip" aria-label={tr('Winning answers')}>
      {shots.map(({ outcome, image, challenge, custom }) => {
        const winner = outcome.winnerId ? match.players[outcome.winnerId] : undefined;
        const prompt = custom?.prompt ?? tr(challenge?.prompt ?? '');
        return (
          <li
            key={outcome.roundId}
            className={`filmstrip__shot ${outcome.winnerId === youId ? 'is-yours' : ''}`}
          >
            <img src={image} alt={`${winner?.name ?? tr('Winner')}: ${prompt}`} loading="lazy" />
            <span className="filmstrip__prompt">{prompt}</span>
            <span className="filmstrip__winner">
              {outcome.winnerId === youId ? tr('You') : (winner?.name ?? tr('Them'))}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
