import { ArrowRight, Flame, Gem, Swords, Target, Trophy } from 'lucide-react';
import type { TelegramHome } from '@battle/shared';
import { tr } from '../../i18n/index.js';
import { RankEmblem } from '../../components/GameArt.jsx';
import { Avatar } from '../../components/Identity.jsx';
import { Empty, PlayerRow, Section, StatGrid, when } from '../ui.jsx';
import { haptics } from '../sdk.js';
import type { View } from '../router.js';

/**
 * The first screen.
 *
 * Ordered by what somebody opening the app actually wants: who they are, the
 * button that starts a duel, and then only the things that answer "did that
 * matter" — today's quests, the last few results, where they sit on the ladder.
 * Anything that is a setting lives behind the profile tab, exactly as it does
 * in the web app.
 */
export function HomeScreen({
  home,
  onGo,
  onPlay,
}: {
  home: TelegramHome;
  onGo: (view: View) => void;
  onPlay: () => void;
}) {
  const { me, quests, recentMatches, leaderboard, incoming, pulse } = home;
  const winRate = me.matchesPlayed ? Math.round((me.wins / me.matchesPlayed) * 100) : null;
  const readyQuests = quests.quests.filter((quest) => quest.done && !quest.claimed).length;

  return (
    <>
      <header className="tg-head">
        {me.photoUrl ? (
          <img className="tg-head__avatar" src={me.photoUrl} alt="" width={46} height={46} />
        ) : (
          <Avatar avatar={me.avatar} size={46} name={me.name} />
        )}
        <span className="tg-head__who">
          <strong>{me.name}</strong>
          <span>
            {me.placed ? me.rank.label : tr('Placement')}
            {me.position ? ` · #${me.position}` : ''}
          </span>
        </span>
        <span className="tg-head__coins">
          <Gem size={13} aria-hidden />
          {me.coins}
        </span>
      </header>

      <div className="plate tg-hero">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
          <RankEmblem rating={me.rating} size={72} placing={!me.placed} />
          <div style={{ minWidth: 0 }}>
            <h1>{tr(me.streak >= 2 ? 'Keep the run going' : 'Ready for a duel?')}</h1>
            <p>
              {me.placed
                ? tr('Same challenge, one camera each. First to find it wins.')
                : tr(
                    `${5 - me.matchesPlayed} more ranked matches and your rating counts.`,
                  )}
            </p>
          </div>
        </div>

        <button
          type="button"
          className="btn btn--primary btn--lg btn--block"
          onClick={() => {
            haptics.tap('medium');
            onPlay();
          }}
        >
          <Swords size={18} aria-hidden />
          {tr('Find an opponent')}
        </button>

        {me.rank.pointsToNext !== null && (
          <div className="tg-hero__rank">
            <span>{tr('Next rung')}</span>
            <b>
              {me.rank.pointsToNext}
              {tr(' rating away')}
            </b>
          </div>
        )}
      </div>

      <StatGrid
        items={[
          { label: 'Rating', value: String(me.rating) },
          { label: 'Wins', value: String(me.wins) },
          { label: 'Win rate', value: winRate === null ? '—' : `${winRate}%` },
          { label: 'Streak', value: String(me.streak), hot: me.streak >= 3 },
        ]}
      />

      {incoming.length > 0 && (
        <Section title="Waiting for you">
          {incoming.map((challenge) => (
            <PlayerRow
              key={challenge.code}
              player={challenge.host}
              detail={tr('challenged you to a duel')}
              end={<ArrowRight size={16} aria-hidden />}
              onOpen={() => onGo({ k: 'challenge', code: challenge.code })}
            />
          ))}
        </Section>
      )}

      <Section
        title="Today"
        action={readyQuests ? `Claim ${readyQuests}` : 'All quests'}
        onAction={() => onGo({ k: 'quests' })}
      >
        {quests.quests.slice(0, 2).map((quest) => (
          <div key={quest.id} className={`tg-quest ${quest.done ? 'is-done' : ''}`}>
            <div className="tg-quest__top">
              <div>
                <strong>{tr(quest.title)}</strong>
                <span>{tr(quest.description)}</span>
              </div>
              <span className="tg-quest__reward">
                {quest.claimed ? tr('claimed') : `+${quest.reward}`}
              </span>
            </div>
            <div className="bar bar--thin">
              <i style={{ width: `${Math.round((quest.progress / quest.target) * 100)}%` }} />
            </div>
          </div>
        ))}
      </Section>

      <Section title="Recent" action="All matches" onAction={() => onGo({ k: 'matches' })}>
        {recentMatches.length === 0 ? (
          <Empty
            title="No duels yet"
            body="Your first finished match is the one that starts your rating."
            action="Play now"
            onAction={onPlay}
          />
        ) : (
          recentMatches.slice(0, 3).map((match) => {
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
                  aria-hidden
                >
                  {match.result === 'win' ? <Trophy size={18} /> : <Target size={18} />}
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
                  <span>{tr('rating')}</span>
                </span>
              </button>
            );
          })
        )}
      </Section>

      <Section title="The ladder" action="Full board" onAction={() => onGo({ k: 'rank' })}>
        {leaderboard.length === 0 ? (
          <Empty
            title="The board is empty"
            body="Five ranked matches puts you on it, and right now first place is open."
            action="Play a ranked duel"
            onAction={onPlay}
          />
        ) : (
          leaderboard
            .slice(0, 3)
            .map((row) => (
              <PlayerRow key={row.ref} player={row} position={row.position} you={row.you} />
            ))
        )}
      </Section>

      {pulse && (
        <p className="dim" style={{ textAlign: 'center', fontSize: 'var(--t-sm)' }}>
          <Flame size={13} aria-hidden />{' '}
          {tr(`${pulse.duelsToday} duels today between ${pulse.playersToday} players.`)}
        </p>
      )}
    </>
  );
}
