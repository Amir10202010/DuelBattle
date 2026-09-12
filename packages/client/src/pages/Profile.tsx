import {
  ACHIEVEMENTS,
  getAchievement,
  isPlaced,
  levelFor,
  nextRank,
  rankFor,
  demotionRisk,
  type PublicProfile,
} from '@battle/shared';
import { pagePath } from '../hooks/useRoute.js';
import { Avatar, LevelBar } from '../components/Identity.jsx';

/**
 * Everything one player has done.
 *
 * Only ever your own. The server has never sent anybody else's history and is
 * not going to: ten of somebody's matches, their streak and their opponents is
 * a stalking tool rather than a scoreboard, and the leaderboard already carries
 * the parts that are genuinely public.
 *
 * There is no separate match-history page. It would be this page with the top
 * half removed, and a navigation item whose reward is less information is a
 * navigation item that should not exist.
 */
export function Profile({
  profile,
  onNavigate,
}: {
  profile: PublicProfile | null;
  onNavigate: (path: string) => void;
}) {
  const go = (path: string) => (event: React.MouseEvent) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    onNavigate(path);
  };

  if (!profile) {
    return (
      <main className="page page--profile">
        <p className="page__loading" role="status">
          Finding your record…
        </p>
      </main>
    );
  }

  const placed = isPlaced(profile.matchesPlayed);
  const rank = rankFor(profile.rating);
  const up = nextRank(profile.rating);
  const down = demotionRisk(profile.rating);
  const level = levelFor(profile.xp);
  const history = profile.history ?? [];
  const unlocked = profile.achievements
    .map((id) => getAchievement(id))
    .filter((a): a is NonNullable<typeof a> => Boolean(a));
  const winRate =
    profile.matchesPlayed > 0 ? Math.round((profile.wins / profile.matchesPlayed) * 100) : 0;

  return (
    <main className="page page--profile">
      <header className="profilehead">
        <Avatar avatar={profile.avatar} size={84} name={profile.name} />
        <div className="profilehead__who">
          <h1 className="profilehead__name display">{profile.name || 'Unnamed player'}</h1>
          <p className="profilehead__rank">
            <span className={`profilehead__tier ${placed ? '' : 'is-placing'}`}>
              {placed ? rank.label : 'Still placing'}
            </span>
            <span className="profilehead__rating mono">{profile.rating}</span>
            {profile.peakRating > profile.rating && (
              <span className="profilehead__peak dim">peak {profile.peakRating}</span>
            )}
          </p>
          <p className="profilehead__blurb dim">
            {placed
              ? rank.tier.blurb
              : `${profile.matchesPlayed} of 5 placement matches played.`}
          </p>
        </div>
        <a className="btn btn--ghost" href={pagePath('settings')} onClick={go(pagePath('settings'))}>
          Edit
        </a>
      </header>

      <section className="profileladder">
        <div className="climb__head">
          <span className="eyebrow">On the ladder</span>
          <span className="climb__target">
            {up ? `${up.pointsAway} to ${up.rank.label}` : 'Top of the ladder'}
          </span>
        </div>
        <div className="climb__track">
          <div className="climb__fill" style={{ width: `${Math.round(rank.progress * 100)}%` }} />
        </div>
        {placed && down && down.pointsAway <= 40 && (
          <p className="climb__risk">
            {down.pointsAway} above the drop to {down.rank.label}.
          </p>
        )}
        <LevelBar xp={profile.xp} />
      </section>

      <section className="statgrid">
        {[
          ['Played', profile.matchesPlayed],
          ['Won', profile.wins],
          ['Lost', profile.losses],
          ['Drawn', profile.draws],
          ['Win rate', `${winRate}%`],
          ['Streak', profile.streak > 0 ? `${profile.streak}W` : '—'],
          ['Best streak', profile.bestStreak > 0 ? `${profile.bestStreak}W` : '—'],
          ['Level', level.level],
          ['XP', profile.xp.toLocaleString('en-GB')],
          ['Awards', `${unlocked.length}/${ACHIEVEMENTS.length}`],
        ].map(([label, value]) => (
          <div key={String(label)} className="stat">
            <span className="stat__label">{label}</span>
            <span className="stat__value mono">{value}</span>
          </div>
        ))}
      </section>

      <section className="panel">
        <div className="panel__head">
          <h2 className="panel__title">Awards</h2>
          <a className="panel__link" href={pagePath('awards')} onClick={go(pagePath('awards'))}>
            All {ACHIEVEMENTS.length}
          </a>
        </div>
        {unlocked.length === 0 ? (
          <p className="panel__empty dim">
            None yet. The first one arrives the moment a match finishes.
          </p>
        ) : (
          <ul className="trophies">
            {unlocked.map((award) => (
              <li key={award.id} className={`trophy trophy--${award.rarity}`} title={award.description}>
                <span className="trophy__name">{award.name}</span>
                <span className="trophy__what">{award.description}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <div className="panel__head">
          <h2 className="panel__title">Match history</h2>
          <span className="panel__note dim">Last {history.length}</span>
        </div>
        {history.length === 0 ? (
          <p className="panel__empty dim">
            Nothing finished yet. A match only counts when both of you actually played it.
          </p>
        ) : (
          <ol className="history" aria-label="Recent matches">
            {history.map((record) => {
              const move = record.ratingAfter - record.ratingBefore;
              return (
                <li key={record.at} className={`history__row is-${record.result}`}>
                  <span className="history__result">{record.result}</span>
                  <span className="history__who">{record.opponentName || 'Someone'}</span>
                  <span className="history__score mono">
                    {record.yourScore}&ndash;{record.theirScore}
                  </span>
                  <span className="history__move mono">
                    {move > 0 ? '+' : ''}
                    {move}
                  </span>
                  {record.xp != null && <span className="history__xp mono">+{record.xp} XP</span>}
                  <time className="history__when dim" dateTime={new Date(record.at).toISOString()}>
                    {when(record.at)}
                  </time>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </main>
  );
}

/** Relative for anything recent, a date once "days ago" stops meaning anything. */
function when(at: number): string {
  const minutes = Math.floor((Date.now() - at) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
