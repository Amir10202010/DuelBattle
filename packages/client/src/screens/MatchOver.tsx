import { tr, useUiPreferences } from '../i18n/index.js';
import { CoinIcon } from '../components/currency/Coins.jsx';
import { useEffect, useState } from 'react';
import {
  getAchievement,
  COSMETICS,
  POINTS_PER_TIER,
  getChallenge,
  opponentOf,
  questById,
  rankFor,
  seasonLevel,
  type MatchRewards,
  type PublicMatchState,
  type PublicProfile,
  type RatingDelta,
  type RoundOutcome,
} from '@battle/shared';
import { Celebration } from '../components/Celebration.jsx';
import { ArrowRight, Check, RotateCcw, Share2, Target, Trophy } from 'lucide-react';
import { RatingLine } from '../components/Rating.jsx';
import type { MatchStore } from '../net/store.js';
import { SeriesLine } from '../components/Series.jsx';
import { LevelBar } from '../components/Identity.jsx';
import { RankEmblem, RewardArt } from '../components/GameArt.jsx';
import { sound } from '../media/sound.js';
import { DuelActors } from '../components/battle/DuelActors.jsx';
import { useAnimatedNumber } from '../hooks/useAnimatedNumber.js';
import { Hero } from '../components/avatar/Hero.jsx';
import { PassIcon } from '../components/meta/Currency.jsx';
import { shareResult } from '../components/meta/share.js';
import { track } from '../analytics.js';

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
    if (outcome.reason === 'faster' && mine.elapsedMs != null && theirs?.elapsedMs != null) {
      const behind = (mine.elapsedMs - theirs.elapsedMs) / 1000;
      // Under a twentieth of a second this rounds to "0.0s slower", which reads
      // as a bug to the person who lost by it.
      if (behind < 0.05) return { label: 'photo finish', kind: 'slower' };
      return { label: `${behind.toFixed(1)}s slower`, kind: 'slower' };
    }
    return outcome.reason === 'better-answer' ? { label: 'Less accurate answer', kind: 'fit' }
      : outcome.winnerId === null ? { label: 'Matched', kind: 'matched' } : { label: 'slower', kind: 'slower' };
  }

  const note = mine.note.toLowerCase();
  if (note.includes('rejected')) return { label: 'voted down', kind: 'rejected' };
  if (note.includes('passed')) return { label: 'passed', kind: 'missed' };
  if (note.includes('ran out')) return { label: 'out of time', kind: 'missed' };
  return { label: 'not detected', kind: 'missed' };
}

/**
 * The end of a match, in the order it should land: what happened, what the
 * score was, what it paid, and only then what to do next. A loss reads the
 * same way as a win — the XP bar still moves, which is the point of having one.
 */
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
  const drawn = !match.winnerId;
  const headline =
    match.endReason === 'abandoned'
      ? 'Match ended'
      : drawn
        ? 'Draw'
        : won
          ? 'Victory!'
          : 'Good game';

  return (
    <section className={`over ${won ? 'over--win' : drawn ? 'over--draw' : 'over--loss'}`} aria-label={tr('Match result')}>
      <div className="over__head">
        {won && <Celebration finale />}
        <span className="eyebrow">{tr(match.ranked ? 'Ranked duel' : 'Casual duel')}</span>
        <h1 className="over__title display">{tr(headline)}</h1>
        {match.endReason === 'forfeit' && (
          <p className="over__sub dim">{tr(won ? 'Your opponent left.' : 'You left the match.')}</p>
        )}
        <SeriesLine match={match} youId={youId} className="over__series" />
      </div>

      <DuelActors match={match} youId={youId} standings={standings} placement="match" />
      <div className="over__score">
        {[youId, ...match.seats.filter((id) => id && id !== youId)].slice(0, 2).map((id, seat) => {
          const player = id ? (match.players[id] ?? null) : null;
          const winner = Boolean(id && id === match.winnerId);
          return (
            <div
              key={seat}
              className={`over__side over__side--seat${seat} ${winner ? 'is-winner' : ''}`}
            >
              <span className="over__name">
                {winner && <Trophy size={14} aria-label={tr('Winner')} />}
                {player?.name ?? '—'}
              </span>
              <span className="over__number display num">{player?.score ?? 0}</span>
              {id && match.ranked && (
                <RatingLine profile={standings[id]} delta={lastRatings?.[id] ?? undefined} />
              )}
            </div>
          );
        })}
      </div>

      <Payout rewards={rewards} profile={standings[youId]} />
      <MatchInsight match={match} youId={youId} />

      {!rewards &&
        (match.ranked ? (
          <details className="over__unrated">
            <summary>{tr('Rating and XP unchanged')}</summary>
            <p>
              {tr(
                'This battle did not qualify for progression. Verification, participation and rematch limits protect both players.',
              )}
            </p>
          </details>
        ) : !standings[youId] ? (
          <a className="over__guest plate" href="/register" onClick={() => track('tutorial_step', { step: 'guest_signup_from_result' })}>
            <span>
              <strong>{tr('Keep what this match was worth')}</strong>
              <small>{tr('Players earn XP, coins, season pass tiers and quest rewards from every match. Guests keep nothing.')}</small>
            </span>
            <span className="btn btn--primary">
              {tr('Create a player')}
              <ArrowRight size={15} />
            </span>
          </a>
        ) : (
          <p className="over__unrated">{tr('Casual rewards require two signed-in players who answer at least half the rounds.')}</p>
        ))}

      <div className="over__actions">
        <button
          className="btn btn--primary btn--lg over__again"
          onClick={() => {
            track('rematch_pressed', { mode: match.ranked ? 'ranked' : 'casual', opponent: Boolean(opponent?.connected) });
            if (opponent?.connected) store.rematch();
            else onFindAnother();
          }}
          disabled={Boolean(opponent?.connected && you?.rematchVote)}
        >
          <RotateCcw size={18} aria-hidden="true" />
          {tr(you?.rematchVote && opponent?.connected ? 'Waiting for them…' : 'Play again')}
        </button>
        {match.endReason !== 'abandoned' && opponent && (
          <button
            className="btn btn--lg over__share"
            onClick={() =>
              void shareResult({
                you: you?.name ?? tr('You'),
                them: opponent.name,
                yourScore: you?.score ?? 0,
                theirScore: opponent.score,
                won,
                ranked: Boolean(match.ranked),
              })
            }
          >
            <Share2 size={17} aria-hidden="true" />
            {tr('Share')}
          </button>
        )}
        {opponent?.connected && (
          <button className="btn btn--lg" onClick={onFindAnother}>
            {tr('New opponent')}
            <ArrowRight size={16} aria-hidden="true" />
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

      {match.history.length > 0 && (
        <details className="over__recap">
          <summary>
            {tr('Round recap')}
            <i>{'·'}</i>
            {match.history.length}
          </summary>
          <Filmstrip match={match} youId={youId} evidence={evidence} />
          <ol className="recap" aria-label={tr('Round by round')}>
            {match.history.map((outcome) => {
              const challenge = getChallenge(outcome.challengeId);
              const custom = match.customChallenges.find((c) => c.id === outcome.challengeId);
              const why = yourOutcome(outcome, youId);
              return (
                <li key={outcome.roundNumber} className="recap__row">
                  <span className="recap__num num">
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
    </section>
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
  const xp = useAnimatedNumber(revealed ? rewards?.xp ?? 0 : 0);
  const coins = useAnimatedNumber(revealed ? rewards?.coins ?? 0 : 0);
  useEffect(() => {
    if (!rewards) return;
    const xpTimer = window.setTimeout(() => {
      setRevealed(true);
      sound.play('xpGain');
    }, 650);
    const rewardTimer = window.setTimeout(() => {
      if (rewards.rankMove === 'promoted') sound.play('rankUp');
      else if (rewards.unlocked.length || COSMETICS.some((item) => item.price === 0 && item.level && item.level > rewards.levelBefore && item.level <= rewards.levelAfter)) sound.play('reward');
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
  const cosmetics = COSMETICS.filter((item) => item.price === 0 && item.level && item.level > rewards.levelBefore && item.level <= rewards.levelAfter);

  return (
    <section
      className={`payout plate ${revealed ? 'is-revealed' : ''}`}
      aria-label={tr('What this match was worth')}
    >
      {rewards.rankMove === 'promoted' && (
        <div className="promotion" role="status">
          <RankEmblem rating={profile.rating} size={92} />
          <div>
            <span className="eyebrow">{tr('Rank up')}</span>
            <h2 className="display">{tr(rankFor(profile.rating).label)}</h2>
          </div>
        </div>
      )}

      <div className="payout__head">
        <span className="payout__xp display num" aria-label={`+${rewards.xp} ${tr('XP')}`}>
          {'+'}
          {xp}
        </span>
        <span className="payout__label">{tr('XP')}</span>
        {!!rewards.coins && (
          <span className="payout__coins">
            <CoinIcon size={24} />
            <strong className="num" aria-label={`+${rewards.coins} ${tr('Battle coins')}`}>{`+${coins}`}</strong>
          </span>
        )}
        {levelled && (
          <span className="payout__level">
            {tr('Level ')}
            {rewards.levelAfter}
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

      {cosmetics.map((item) => <div className="payout__cosmetic" key={item.id}>
        <Hero loadout={{ ...profile.loadout, [item.slot]: item.id }} size={80} pose="unlock" animated={revealed} />
        <span><small className="eyebrow">{tr('Unlocked')}</small><strong>{tr(item.name)}</strong><small>{tr('Ready in your locker')}</small></span>
      </div>)}

      {rewards.meta?.pass && <PassProgress pass={rewards.meta.pass} revealed={revealed} />}
      {rewards.meta && rewards.meta.quests.length > 0 && (
        <ul className="payout__quests" aria-label={tr('Quest progress')}>
          {rewards.meta.quests.map((quest) => {
            const definition = questById(quest.id);
            return (
              <li key={quest.id} className={quest.done ? 'is-done' : ''}>
                {quest.done ? <Check size={15} /> : <Target size={15} />}
                <span>{tr(definition?.title ?? quest.id)}</span>
                <b className="num">
                  {quest.progress}/{quest.target}
                </b>
                {quest.done && <small>{tr('Collect on home')}</small>}
              </li>
            );
          })}
        </ul>
      )}
      {rewards.meta?.capped && (
        <p className="payout__capped">{tr('Casual reward limit reached for today or for this opponent. Quests still count.')}</p>
      )}

      {!!rewards.dailyBonus && (
        <p className="payout__daily">
          {tr('Daily challenge complete · +')}
          {rewards.dailyBonus}
          {tr(' XP included')}
        </p>
      )}

      {unlocked.length > 0 && (
        <ul className="payout__awards">
          {unlocked.map((award) => (
            <li
              key={award.id}
              className={`payout__award is-${award.rarity}`}
              title={tr(award.description)}
            >
              <RewardArt group={award.group} rarity={award.rarity} />
              <span className="payout__awardname">{tr(award.name)}</span>
              <span className="payout__awardxp num">
                {'+'}
                {award.xp}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The season bar, moving: where it was before the match and where it is now,
 * and a tier-up called out when one happened. The same arithmetic the server
 * used, so the bar lands exactly where the pass page will show it.
 */
function PassProgress({ pass, revealed }: { pass: { points: number; before: number; after: number }; revealed: boolean }) {
  useUiPreferences();
  const before = seasonLevel(pass.before);
  const after = seasonLevel(pass.after);
  const shown = revealed ? after : before;
  const tierUp = after.tier > before.tier;
  useEffect(() => {
    if (revealed && tierUp) {
      const timer = window.setTimeout(() => sound.play('levelUp'), 500);
      return () => window.clearTimeout(timer);
    }
  }, [revealed, tierUp]);
  return (
    <div className={`payout__pass ${tierUp && revealed ? 'is-tier-up' : ''}`}>
      <PassIcon size={26} />
      <div>
        <span className="payout__pass-head">
          <b>{`+${pass.points}`}</b> {tr('pass XP')}
          {tierUp && revealed && <em>{tr(`Tier ${after.tier} reached`)}</em>}
        </span>
        <div className="season-card__bar" role="progressbar" aria-label={tr('Season pass')} aria-valuenow={shown.into} aria-valuemin={0} aria-valuemax={POINTS_PER_TIER}>
          <i style={{ width: `${shown.maxed ? 100 : (shown.into / POINTS_PER_TIER) * 100}%` }} />
        </div>
        <small className="num">{tr(`Tier ${shown.tier}`)}</small>
      </div>
    </div>
  );
}

function MatchInsight({ match, youId }: { match: PublicMatchState; youId: string }) {
  useUiPreferences();
  if (!match.history.length) return null;
  const answers = match.history.map((round) => round.perPlayer[youId]).filter((answer) => answer?.valid);
  const times = answers.flatMap((answer) => answer?.elapsedMs == null ? [] : [answer.elapsedMs]);
  const scores = answers.flatMap((answer) => answer?.evaluation ? [answer.evaluation.score] : []);
  const inaccurate = match.history.some((round) => round.winnerId && round.winnerId !== youId && round.reason === 'better-answer');
  const tip = match.winnerId === youId ? 'Keep the momentum. Your next rival is waiting.'
    : inaccurate ? 'Get the object closer and keep it clearly in frame.'
      : answers.length ? 'A strong answer comes first. Then work on your speed.' : 'Find the object, fill the centre, then snap before time runs out.';
  return <section className="match-insight" aria-label={tr('Your battle highlights')}>
    <div className="match-insight__stats">
      <div><span>{tr('Valid answers')}</span><strong>{answers.length}<small> / {match.history.length}</small></strong></div>
      <div><span>{tr('Best answer')}</span><strong>{scores.length ? Math.max(...scores) : '—'}<small>{scores.length ? '/100' : ''}</small></strong></div>
      <div><span>{tr('Fastest snap')}</span><strong>{times.length ? `${(Math.min(...times) / 1000).toFixed(1)}` : '—'}<small>{times.length ? ` ${tr('sec')}` : ''}</small></strong></div>
    </div>
    <p>{tr(tip)}</p>
  </section>;
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
