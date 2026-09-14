import { tr, useUiPreferences } from '../i18n/index.js';
import { ArrowRight, Settings, Flame, Trophy, Swords, Target } from 'lucide-react';
import {
  ACHIEVEMENTS,
  getAchievement,
  isPlaced,
  nextRank,
  rankFor,
  demotionRisk,
  type PublicProfile,
} from '@battle/shared';
import { Avatar, LevelBar } from '../components/Identity.jsx';
import { RankEmblem, RewardArt } from '../components/GameArt.jsx';
import { BattleHistory } from '../components/BattleHistory.jsx';
export function Profile({
  profile,
  onNavigate,
}: {
  profile: PublicProfile | null;
  onNavigate: (path: string) => void;
}) {
  useUiPreferences();
  if (!profile) return null;
  const placed = isPlaced(profile.matchesPlayed);
  const rank = rankFor(profile.rating);
  const next = nextRank(profile.rating);
  const down = demotionRisk(profile.rating);
  const unlocked = profile.achievements
    .map(getAchievement)
    .filter((a): a is NonNullable<typeof a> => !!a);
  const categories = new Map<string, number>();
  for (const record of profile.history ?? [])
    for (const category of record.categories ?? [])
      categories.set(category, (categories.get(category) ?? 0) + 1);
  const favorites = [...categories].sort((a, b) => b[1] - a[1]).slice(0, 3);
  return (
    <main className="page">
      <section className="player-cover">
        <span className="eyebrow">{tr('Player dossier')}</span>
        <div className="player-cover__main">
          <Avatar avatar={profile.avatar} size={88} name={profile.name} />
          <div>
            <h1>{profile.name}</h1>
            <span className="player-cover__rank">
              {tr(placed ? rank.label : 'Placement in progress')}
            </span>
            <p>
              {tr(
                placed
                  ? rank.tier.blurb
                  : `${profile.matchesPlayed} of 5 ranked matches. Find your place.`,
              )}
            </p>
          </div>
          <button
            className="icon-button"
            title={tr('Edit player')}
            aria-label={tr('Edit player')}
            onClick={() => onNavigate('/settings')}
          >
            <Settings size={19} />
          </button>
        </div>
        <RankEmblem rating={profile.rating} size={172} placing={!placed} />
      </section>
      <section className="home-stats profile-stats">
        {[
          { Icon: Swords, label: 'Battles', value: profile.matchesPlayed },
          { Icon: Trophy, label: 'Wins', value: profile.wins },
          {
            Icon: Target,
            label: 'Win rate',
            value: profile.matchesPlayed
              ? `${Math.round((profile.wins / profile.matchesPlayed) * 100)}%`
              : '—',
          },
          { Icon: Flame, label: 'Best streak', value: profile.bestStreak },
        ].map(({ Icon, label, value }) => (
          <div key={label}>
            <span>
              <Icon size={16} />
              {tr(label)}
            </span>
            <strong>{tr(value)}</strong>
          </div>
        ))}
      </section>
      <div className="profile-grid">
        <section className="panel">
          <div className="card-heading">
            <h2>{tr('Your climb')}</h2>
            <button className="text-link" onClick={() => onNavigate('/ranks')}>
              {tr('The ladder ')}
              <ArrowRight size={15} />
            </button>
          </div>
          <div className="rating-summary">
            <strong>
              {tr(profile.rating)}
              <small>{tr('MMR')}</small>
            </strong>
            <span>
              {tr('Personal best ')}
              <b>{tr(profile.peakRating)}</b>
            </span>
          </div>
          <div className="progress-track">
            <i style={{ width: `${rank.progress * 100}%` }} />
          </div>
          <p className="progress-caption">
            {tr(
              next
                ? `${next.pointsAway} MMR to ${tr(next.rank.label)}`
                : 'At the summit. Make it yours.',
            )}
          </p>
          {placed && down && down.pointsAway <= 40 && (
            <p className="rank-risk">
              {tr(down.pointsAway + 1)}
              {tr(' MMR loss would move you to ')}
              {tr(down.rank.label)}
              {tr('. Your XP and earned badges stay.')}
            </p>
          )}
          <LevelBar xp={profile.xp} />
        </section>
        <section className="panel">
          <div className="card-heading">
            <h2>{tr('Your style')}</h2>
            <Target size={18} />
          </div>
          <p className="dim">{tr('Most played challenge categories in your recent battles.')}</p>
          {favorites.length ? (
            <div className="favorite-topics">
              {favorites.map(([category, count]) => (
                <span key={category}>
                  {tr(category)}
                  <b>{tr(count)}</b>
                </span>
              ))}
            </div>
          ) : (
            <p className="compact-empty">
              {tr('Play a few ranked duels to discover your strengths.')}
            </p>
          )}
          <div className="profile-record">
            <span>
              {tr(profile.wins)}
              {tr(' wins')}
            </span>
            <span>
              {tr(profile.losses)}
              {tr(' losses')}
            </span>
            <span>
              {tr(profile.draws)}
              {tr(' draws')}
            </span>
          </div>
        </section>
      </div>
      <section className="panel profile-awards">
        <div className="card-heading">
          <h2>{tr('Earned, never given')}</h2>
          <button className="text-link" onClick={() => onNavigate('/awards')}>
            {tr('Collection ')}
            {tr(unlocked.length)}
            {'/'}
            {tr(ACHIEVEMENTS.length)} <ArrowRight size={15} />
          </button>
        </div>
        {unlocked.length ? (
          <ul className="trophy-shelf">
            {unlocked
              .slice(-6)
              .reverse()
              .map((a) => (
                <li key={a.id}>
                  <RewardArt group={a.group} rarity={a.rarity} />
                  <strong>{tr(a.name)}</strong>
                  <span>{tr(a.rarity)}</span>
                </li>
              ))}
          </ul>
        ) : (
          <div className="trophy-empty">
            <RewardArt group="first" locked />
            <div>
              <h3>{tr('The first one is waiting.')}</h3>
              <p>{tr('Finish an eligible ranked match to earn your first achievement.')}</p>
            </div>
          </div>
        )}
      </section>
      <section className="panel">
        <div className="card-heading">
          <h2>{tr('Battle history')}</h2>
          <span className="dim">
            {tr('Last ')}
            {tr(profile.history?.length ?? 0)}
            {tr(' matches')}
          </span>
        </div>
        <BattleHistory history={profile.history ?? []} onPlay={() => onNavigate('/play')} />
      </section>
    </main>
  );
}
