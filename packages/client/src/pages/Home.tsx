import { ArrowRight, MoveUpRight, Zap } from 'lucide-react';
import {
  TOPICS,
  achievementOrder,
  allChallengesPool,
  getAchievement,
  getChallenge,
  isPlaced,
  levelFor,
  nextRank,
  rankFor,
  type LeaderboardEntry,
  type PublicProfile,
} from '@battle/shared';
import { pagePath } from '../hooks/useRoute.js';
import { Avatar, LevelBar } from '../components/Identity.jsx';

interface HomeProps {
  profile: PublicProfile | null;
  board: LeaderboardEntry[];
  onNavigate: (path: string) => void;
}

/**
 * Two front pages behind one address.
 *
 * A stranger needs to be told what this is; somebody who played last night
 * needs a button and their numbers. Showing the second person the pitch again
 * is how a game reads as a marketing site, and showing the first person a
 * dashboard of zeroes is how it reads as a spreadsheet. The switch is whether
 * anything has ever been played.
 */
export function Home({ profile, board, onNavigate }: HomeProps) {
  const played = (profile?.matchesPlayed ?? 0) > 0;
  return played && profile ? (
    <Returning profile={profile} board={board} onNavigate={onNavigate} />
  ) : (
    <FirstTime onNavigate={onNavigate} />
  );
}

const STEPS = [
  ['01', 'Find your rival', 'Quick match, or send one link. No account, nothing to install.'],
  ['02', 'Camera on, game on', 'You both get the same prompt at the same second.'],
  ['03', 'Grab it first', 'Hold it up. The fastest valid answer takes the round.'],
] as const;

/** Three real prompts, one per judge, pulled from the catalogue rather than retyped. */
const SHOWCASE = [
  { id: 'color-red', judge: 'The camera decides', tone: 'coral', note: '20 seconds.' },
  { id: 'act-blue-head', judge: 'The AI judge decides', tone: 'lime', note: 'Yes, really.' },
  { id: 'story-older', judge: 'Your opponent decides', tone: 'paper', note: 'A story counts.' },
] as const;

const MARQUEE = ['See it', 'Grab it', 'Show it', 'Win it', 'Rematch'];

function FirstTime({ onNavigate }: { onNavigate: (path: string) => void }) {
  const play = (event: React.MouseEvent) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    onNavigate(pagePath('play'));
  };

  return (
    <main className="landing">
      <section className="hero">
        <div className="hero__pitch">
          <p className="eyebrow eyebrow--mark">Real friends, real-time rivalry</p>
          <h1 className="hero__title display">
            Your room
            <br />
            is the <span className="hero__mark">arena.</span>
          </h1>
          <p className="hero__lede">
            Two players, two cameras, one prompt at a time. Everything you need to win is already
            within arm&rsquo;s reach — you just have to find it faster than they do.
          </p>
          <div className="hero__actions">
            <a className="btn btn--primary btn--lg" href={pagePath('play')} onClick={play}>
              Play now <ArrowRight size={17} aria-hidden="true" />
            </a>
            <span className="hero__note dim">No account. Takes about a minute.</span>
          </div>
        </div>

        <aside className="hero__demo">
          <div className="scene">
            <div className="scene__topline" aria-hidden="true">
              <span>This could get personal</span>
              <span className="mono">01 / 05</span>
            </div>
            <div className="scene__photo">
              <img
                src="/friends.jpg"
                alt="Two people in separate rooms, one holding up a red mug and the other a red trainer."
                width={1200}
                height={800}
                fetchPriority="high"
              />
              <span className="scene__vs" aria-hidden="true">VS</span>
              <span className="scene__player scene__player--one" aria-hidden="true">The mug person</span>
              <span className="scene__player scene__player--two" aria-hidden="true">The shoe person</span>
            </div>
            <div className="scene__challenge">
              <span className="scene__label">
                <Zap size={13} fill="currentColor" aria-hidden="true" /> Example challenge
              </span>
              <span className="scene__prompt display">
                Show something <span className="hero__mark">red.</span>
              </span>
              <MoveUpRight size={28} aria-hidden="true" />
            </div>
            <div className="scene__caption">
              <span>One challenge. Two very different answers.</span>
              <span className="scene__credit">Staged scene</span>
            </div>
          </div>
          <span className="sticker" aria-hidden="true">
            Less scroll
            <br />
            more chaos
          </span>
        </aside>
      </section>

      <div className="marquee" aria-hidden="true">
        <div className="marquee__track">
          {[0, 1].map((copy) => (
            <span key={copy} className="marquee__run">
              {MARQUEE.map((word) => (
                <span key={word} className="marquee__word display">
                  {word}
                  <i className="marquee__star">✳</i>
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>

      <section className="rules">
        <p className="eyebrow">The rules are simple</p>
        <div className="rules__head">
          <h2 className="rules__title display">
            A little panic.
            <br />A lot of fun.
          </h2>
          <p className="rules__aside">All you need is a rival, a camera, and whatever is within reach.</p>
        </div>
        <ol className="steps">
          {STEPS.map(([n, title, detail]) => (
            <li key={n} className="steps__item">
              <span className="steps__num mono">{n}</span>
              <h3 className="steps__title">{title}</h3>
              <p className="steps__detail">{detail}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="showcase">
        <div className="showcase__head">
          <div>
            <p className="eyebrow">Expect the unexpected</p>
            <h2 className="showcase__title display">
              Your junk drawer
              <br />
              has been training for this.
            </h2>
          </div>
          {/* Counted, not typed: a number in prose goes stale the first time
              somebody adds a prompt. */}
          <p className="showcase__aside">
            {allChallengesPool().length.toLocaleString('en-GB')} challenges, three different
            referees, and zero preparation required.
          </p>
        </div>
        <div className="cards">
          {SHOWCASE.map(({ id, judge, tone, note }) => {
            const challenge = getChallenge(id);
            if (!challenge) return null;
            return (
              <article key={id} className={`card card--${tone}`}>
                <p className="card__judge">{judge}</p>
                <p className="card__prompt display">{challenge.prompt}</p>
                <p className="card__note">{note}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="fairplay">
        <p className="eyebrow">Nobody likes a cheat</p>
        <div className="fairplay__grid">
          <h2 className="fairplay__title display">
            Show it. Prove it.
            <br />
            Keep it friendly.
          </h2>
          <div className="fairplay__body">
            <p>
              Your snapshot is scored against the frame taken before the prompt appeared, so the red
              rug that was already in shot earns nothing and the red mug you lifted into view earns
              everything.
            </p>
            <p>
              The server re-runs every check itself. A modified browser can change what it shows
              you; it cannot change what it wins.
            </p>
            <p className="fairplay__fine">
              Frames go to your opponent and are kept only long enough to score the round. Nothing
              is recorded, nothing is stored, and there is no microphone.
            </p>
          </div>
        </div>
      </section>

      <section className="closer">
        <h2 className="closer__title display">Go and win something.</h2>
        <a className="btn btn--primary btn--lg" href={pagePath('play')} onClick={play}>
          Find an opponent <ArrowRight size={17} aria-hidden="true" />
        </a>
      </section>
    </main>
  );
}

/**
 * The returning player's page.
 *
 * Ordered by what somebody actually came back for: the button, then where they
 * are, then what happened last time, then something to chase. Nothing here is a
 * duplicate of a page in the navigation — each block is the smallest useful
 * slice of one, with a way through to the rest.
 */
function Returning({
  profile,
  board,
  onNavigate,
}: {
  profile: PublicProfile;
  board: LeaderboardEntry[];
  onNavigate: (path: string) => void;
}) {
  const go = (path: string) => (event: React.MouseEvent) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    onNavigate(path);
  };

  const placed = isPlaced(profile.matchesPlayed);
  const rank = rankFor(profile.rating);
  const step = nextRank(profile.rating);
  const history = profile.history ?? [];
  const level = levelFor(profile.xp);
  const chasing = achievementOrder(
    { ...profile, peakRating: profile.peakRating },
    profile.achievements,
  ).filter((a) => !profile.achievements.includes(a.id));
  const winRate = profile.matchesPlayed > 0 ? Math.round((profile.wins / profile.matchesPlayed) * 100) : 0;

  return (
    <main className="page page--dash">
      <section className="dash__hero">
        <div className="dash__greeting">
          <Avatar avatar={profile.avatar} size={54} name={profile.name} />
          <div>
            <p className="eyebrow">Welcome back{profile.name ? `, ${profile.name}` : ''}</p>
            <h1 className="dash__title display">
              {placed ? rank.label : 'Still placing'}
              <span className="dash__rating mono">{profile.rating}</span>
            </h1>
          </div>
        </div>
        <a className="btn btn--primary btn--lg" href={pagePath('play')} onClick={go(pagePath('play'))}>
          Play <ArrowRight size={17} aria-hidden="true" />
        </a>
      </section>

      <section className="dash__progress">
        <div className="dash__climb">
          <div className="climb__head">
            <span className="eyebrow">{placed ? 'Next rung' : 'Placement'}</span>
            <span className="climb__target">
              {!placed
                ? `${Math.max(0, 5 - profile.matchesPlayed)} more to place`
                : step
                  ? `${step.pointsAway} to ${step.rank.label}`
                  : 'Top of the ladder'}
            </span>
          </div>
          <div className="climb__track">
            <div className="climb__fill" style={{ width: `${Math.round(rank.progress * 100)}%` }} />
          </div>
          <a className="dash__more" href={pagePath('ranks')} onClick={go(pagePath('ranks'))}>
            How ranks work <ArrowRight size={13} aria-hidden="true" />
          </a>
        </div>
        <LevelBar xp={profile.xp} />
      </section>

      <section className="dash__stats">
        {[
          ['Played', profile.matchesPlayed],
          ['Won', profile.wins],
          ['Win rate', `${winRate}%`],
          ['Streak', profile.streak > 0 ? `${profile.streak}W` : '—'],
          ['Best', profile.bestStreak > 0 ? `${profile.bestStreak}W` : '—'],
          ['Level', level.level],
        ].map(([label, value]) => (
          <div key={String(label)} className="stat">
            <span className="stat__label">{label}</span>
            <span className="stat__value mono">{value}</span>
          </div>
        ))}
      </section>

      <div className="dash__grid">
        <section className="panel">
          <div className="panel__head">
            <h2 className="panel__title">Last matches</h2>
            <a className="panel__link" href={pagePath('profile')} onClick={go(pagePath('profile'))}>
              All of them
            </a>
          </div>
          {history.length === 0 ? (
            <p className="panel__empty dim">Nothing finished yet. Play one and it lands here.</p>
          ) : (
            <ol className="minihistory">
              {history.slice(0, 4).map((record) => (
                <li key={record.at} className={`minihistory__row is-${record.result}`}>
                  <span className="minihistory__result">{record.result}</span>
                  <span className="minihistory__who">{record.opponentName || 'Someone'}</span>
                  <span className="minihistory__score mono">
                    {record.yourScore}&ndash;{record.theirScore}
                  </span>
                  <span className="minihistory__move mono">
                    {record.ratingAfter - record.ratingBefore > 0 ? '+' : ''}
                    {record.ratingAfter - record.ratingBefore}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="panel">
          <div className="panel__head">
            <h2 className="panel__title">Next award</h2>
            <a className="panel__link" href={pagePath('awards')} onClick={go(pagePath('awards'))}>
              All awards
            </a>
          </div>
          {chasing.length === 0 ? (
            <p className="panel__empty dim">Every one of them. There is nothing left to chase.</p>
          ) : (
            <ul className="chase">
              {chasing.slice(0, 3).map((award) => {
                const step = award.progress?.({ ...profile });
                return (
                  <li key={award.id} className="chase__row">
                    <span className="chase__name">{award.name}</span>
                    <span className="chase__what dim">{award.description}</span>
                    {step && (
                      <span className="chase__bar" aria-hidden="true">
                        <i style={{ width: `${Math.round((step.have / step.need) * 100)}%` }} />
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="panel">
          <div className="panel__head">
            <h2 className="panel__title">Top of the board</h2>
            <a
              className="panel__link"
              href={pagePath('leaderboard')}
              onClick={go(pagePath('leaderboard'))}
            >
              Full board
            </a>
          </div>
          {board.length === 0 ? (
            <p className="panel__empty dim">
              Nobody has finished placement yet. Five matches and you are on it.
            </p>
          ) : (
            <ol className="miniboard">
              {board.slice(0, 5).map((entry) => (
                <li key={`${entry.position}-${entry.name}`} className="miniboard__row">
                  <span className="miniboard__pos mono">{entry.position}</span>
                  <Avatar avatar={entry.avatar} size={22} name={entry.name} />
                  <span className="miniboard__name">{entry.name}</span>
                  <span className="miniboard__rating mono">{entry.rating}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <p className="dash__foot dim">
        {TOPICS.length.toLocaleString('en-GB')} prompts in the deck, and the room remembers the last
        twenty it dealt you.{' '}
        {profile.achievements.length > 0 &&
          `Last unlocked: ${getAchievement(profile.achievements[profile.achievements.length - 1]!)?.name ?? '—'}.`}
      </p>
    </main>
  );
}
