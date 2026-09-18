import { useEffect, useState } from 'react';
import { Calendar, ChevronRight, Gem, Settings as SettingsIcon, Share2, Trophy } from 'lucide-react';
import type { TelegramAchievementView, TelegramMatchRow, TelegramMe } from '@battle/shared';
import { tr, formatDate } from '../../i18n/index.js';
import { RankEmblem } from '../../components/GameArt.jsx';
import { LevelBar } from '../../components/Identity.jsx';
import { api, ApiError } from '../api.js';
import { Empty, Failed, Loading, Section, StatGrid, when } from '../ui.jsx';
import { haptics, shareLink } from '../sdk.js';
import type { View } from '../router.js';

/**
 * Your own card.
 *
 * Everything here is something the player did. Recent form is five letters
 * because that is how long a run has to be before it means anything, and the
 * rest is counts — no "member since" theatre, no badges for opening the app.
 */
export function ProfileScreen({
  me,
  matches,
  onGo,
}: {
  me: TelegramMe;
  matches: TelegramMatchRow[];
  onGo: (view: View) => void;
}) {
  const winRate = me.matchesPlayed ? Math.round((me.wins / me.matchesPlayed) * 100) : null;
  const form = matches.slice(0, 5).reverse();

  return (
    <>
      <div className="plate tg-hero" style={{ justifyItems: 'center', textAlign: 'center' }}>
        <RankEmblem rating={me.rating} size={92} placing={!me.placed} />
        <h1>{me.name}</h1>
        <p>
          {me.placed ? me.rank.label : tr('Placement')}
          {me.position ? ` · #${me.position}` : ''}
          {me.premium.active && <> · <Gem size={13} aria-label={tr('Premium')} /></>}
        </p>
        <LevelBar xp={me.xp} />
        {me.rank.pointsToNext !== null && (
          <div className="bar">
            <i style={{ width: `${Math.round(me.rank.progress * 100)}%` }} />
          </div>
        )}
      </div>

      <StatGrid
        items={[
          { label: 'Rating', value: String(me.rating) },
          { label: 'Peak', value: String(me.peakRating) },
          { label: 'Battles', value: String(me.matchesPlayed) },
          { label: 'Wins', value: String(me.wins) },
          { label: 'Losses', value: String(me.losses) },
          { label: 'Win rate', value: winRate === null ? '—' : `${winRate}%` },
          { label: 'Streak', value: String(me.streak), hot: me.streak >= 3 },
          { label: 'Best streak', value: String(me.bestStreak) },
        ]}
      />

      {form.length > 0 && (
        <Section title="Recent form">
          <div style={{ display: 'flex', gap: 'var(--sp-2)', justifyContent: 'center' }}>
            {form.map((match) => (
              <span
                key={`${match.at}-${match.index}`}
                className={`badge ${match.result === 'win' ? 'tg-win' : match.result === 'loss' ? 'tg-loss' : 'tg-draw'}`}
              >
                {tr(match.result === 'win' ? 'W' : match.result === 'loss' ? 'L' : 'D')}
              </span>
            ))}
          </div>
        </Section>
      )}

      <Section title="Progress">
        <div className="tg-row tg-row--flat">
          <Calendar size={18} aria-hidden />
          <span className="tg-row__main">
            <strong>{tr('Daily streak')}</strong>
            <span>{tr('Days in a row with a finished duel')}</span>
          </span>
          <span className="tg-row__end">
            <b>{me.dailyStreak.current}</b>
            <span>
              {tr('best ')}
              {me.dailyStreak.best}
            </span>
          </span>
        </div>
        <div className="tg-row tg-row--flat">
          <Gem size={18} aria-hidden />
          <span className="tg-row__main">
            <strong>{tr('Battle coins')}</strong>
            <span>{tr('Spent in the store, on the web')}</span>
          </span>
          <span className="tg-row__end">
            <b>{me.coins}</b>
          </span>
        </div>
      </Section>

      <Section title="More">
        <button type="button" className="tg-row" onClick={() => onGo({ k: 'matches' })}>
          <Trophy size={18} aria-hidden />
          <span className="tg-row__main">
            <strong>{tr('Match history')}</strong>
            <span>
              {matches.length ? tr(`${me.matchesPlayed} ranked matches`) : tr('Nothing yet')}
            </span>
          </span>
          <ChevronRight size={16} aria-hidden />
        </button>
        <button type="button" className="tg-row" onClick={() => onGo({ k: 'awards' })}>
          <Trophy size={18} aria-hidden />
          <span className="tg-row__main">
            <strong>{tr('Awards')}</strong>
            <span>{tr(`${me.achievements.length} earned`)}</span>
          </span>
          <ChevronRight size={16} aria-hidden />
        </button>
        <button type="button" className="tg-row" onClick={() => onGo({ k: 'premium' })}>
          <Gem size={18} aria-hidden />
          <span className="tg-row__main">
            <strong>{tr('Premium')}</strong>
            <span>{me.premium.active ? tr('Active') : tr('Badge, deeper stats, cosmetics')}</span>
          </span>
          <ChevronRight size={16} aria-hidden />
        </button>
        <button type="button" className="tg-row" onClick={() => onGo({ k: 'settings' })}>
          <SettingsIcon size={18} aria-hidden />
          <span className="tg-row__main">
            <strong>{tr('Settings')}</strong>
            <span>{tr('Notifications, account, privacy')}</span>
          </span>
          <ChevronRight size={16} aria-hidden />
        </button>
      </Section>
    </>
  );
}

/** The full history, paged, newest first. */
export function MatchesScreen({ onGo }: { onGo: (view: View) => void }) {
  const [rows, setRows] = useState<TelegramMatchRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    api
      .matches(0)
      .then((result) => setRows(result.matches))
      .catch((failure: unknown) =>
        setError(failure instanceof ApiError ? failure.message : tr('Could not load your matches.')),
      );
  };
  useEffect(load, []);

  if (error) return <Failed message={error} onRetry={load} />;
  if (!rows) return <Loading />;
  if (rows.length === 0)
    return (
      <Empty
        title="No matches yet"
        body="You have not finished a ranked duel. The first one starts your rating."
      />
    );

  return (
    <Section title="Match history">
      {rows.map((match) => {
        const change = match.ratingAfter - match.ratingBefore;
        return (
          <button
            key={`${match.at}-${match.index}`}
            type="button"
            className="tg-row"
            onClick={() => onGo({ k: 'match', index: match.index })}
          >
            <span
              className={
                match.result === 'win' ? 'tg-win' : match.result === 'loss' ? 'tg-loss' : 'tg-draw'
              }
            >
              {tr(match.result === 'win' ? 'WIN' : match.result === 'loss' ? 'LOSS' : 'DRAW')}
            </span>
            <span className="tg-row__main">
              <strong>
                {match.yourScore}–{match.theirScore} {tr('vs')} {match.opponentName || tr('Player')}
              </strong>
              <span>{when(match.at)}</span>
            </span>
            <span className="tg-row__end">
              <b className={change >= 0 ? 'tg-win' : 'tg-loss'}>
                {change >= 0 ? '+' : ''}
                {change}
              </b>
            </span>
          </button>
        );
      })}
    </Section>
  );
}

/**
 * One match, and the card you can send about it.
 *
 * The share card is built server-side from the same history row, so it cannot
 * claim anything the player was not already shown.
 */
export function MatchScreen({ index }: { index: number }) {
  const [match, setMatch] = useState<TelegramMatchRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  const load = () => {
    setError(null);
    api
      .match(index)
      .then(setMatch)
      .catch((failure: unknown) =>
        setError(failure instanceof ApiError ? failure.message : tr('That match is gone.')),
      );
  };
  useEffect(load, [index]);

  if (error) return <Failed message={error} onRetry={load} />;
  if (!match) return <Loading />;

  const change = match.ratingAfter - match.ratingBefore;
  const tone = match.result === 'win' ? 'tg-win' : match.result === 'loss' ? 'tg-loss' : 'tg-draw';

  return (
    <>
      <div className="plate tg-share">
        <p className={`eyebrow ${tone}`}>
          {tr(match.result === 'win' ? 'Victory' : match.result === 'loss' ? 'Defeat' : 'Draw')}
        </p>
        <h2>
          {match.yourScore}–{match.theirScore}
        </h2>
        <div className="tg-share__lines">
          <span>
            {tr('vs')} {match.opponentName || tr('Player')}
          </span>
          <span className={tone}>
            {change >= 0 ? '+' : ''}
            {change} {tr('rating')} · {match.ratingAfter}
          </span>
          {match.xp ? <span>+{match.xp} {tr('XP')}</span> : null}
          <span className="dim">{formatDate(match.at, { dateStyle: 'medium', timeStyle: 'short' })}</span>
        </div>
      </div>

      <button
        type="button"
        className="btn btn--primary btn--block"
        disabled={sharing}
        onClick={() => {
          setSharing(true);
          haptics.tap();
          api
            .shareCard(index)
            .then((card) => shareLink(card.link, card.shareText))
            .catch(() => setError(tr('Could not build that card.')))
            .finally(() => setSharing(false));
        }}
      >
        <Share2 size={16} aria-hidden />
        {tr('Share this result')}
      </button>

      {match.forfeited && (
        <p className="dim" style={{ textAlign: 'center' }}>
          {tr('This one ended early, so it paid no XP.')}
        </p>
      )}
    </>
  );
}

/** The award catalogue, earned first. */
export function AwardsScreen() {
  const [awards, setAwards] = useState<TelegramAchievementView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    api
      .achievements()
      .then((result) => setAwards(result.achievements))
      .catch((failure: unknown) =>
        setError(failure instanceof ApiError ? failure.message : tr('Could not load your awards.')),
      );
  };
  useEffect(load, []);

  if (error) return <Failed message={error} onRetry={load} />;
  if (!awards) return <Loading />;

  const earned = awards.filter((award) => award.unlocked);
  const locked = awards.filter((award) => !award.unlocked);

  return (
    <>
      <Section title={`Earned — ${earned.length} of ${awards.length}`}>
        {earned.length === 0 ? (
          <Empty title="Nothing yet" body="Your first finished duel earns one." />
        ) : (
          <div className="tg-awards">
            {earned.map((award) => (
              <div key={award.id} className={`tg-award rarity is-${award.rarity}`}>
                <strong>{tr(award.name)}</strong>
                <span className="dim">{tr(award.description)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Still locked">
        <div className="tg-awards">
          {locked.map((award) => (
            <div key={award.id} className="tg-award is-locked">
              <strong>{tr(award.name)}</strong>
              <span className="dim">
                {award.progress ? `${award.progress.have}/${award.progress.need}` : tr(award.description)}
              </span>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
