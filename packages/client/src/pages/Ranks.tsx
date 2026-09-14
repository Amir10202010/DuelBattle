import { tr, useUiPreferences } from '../i18n/index.js';
import { ChevronRight, ShieldCheck } from 'lucide-react';
import { TIERS, isPlaced, rankFor, nextRank, type PublicProfile } from '@battle/shared';
import { RankEmblem } from '../components/GameArt.jsx';
export function Ranks({ profile }: { profile: PublicProfile | null }) {
  useUiPreferences();
  if (!profile) return null;
  const here = rankFor(profile.rating);
  const up = nextRank(profile.rating);
  const placed = isPlaced(profile.matchesPlayed);
  return (
    <main className="page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">{tr('The rank journey')}</span>
          <h1>{tr('A reputation you can earn.')}</h1>
          <p>
            {tr(
              'Eight original tiers. Three divisions below the summit. Your next step is always in sight.',
            )}
          </p>
        </div>
        <span className="status-tag">
          <ShieldCheck size={15} />
          {tr(' Skill decides')}
        </span>
      </header>
      <section className="rank-journey">
        <RankEmblem rating={profile.rating} placing={!placed} size={115} />
        <div>
          <span className="eyebrow">{tr('Current standing')}</span>
          <h2>{tr(placed ? here.label : 'Placement in progress')}</h2>
          <p>
            {tr(
              placed
                ? up
                  ? `${up.pointsAway} MMR until ${tr(up.rank.label)}`
                  : 'Welcome to the summit.'
                : `${profile.matchesPlayed}/5 matches completed. Every player starts at 1000 MMR.`,
            )}
          </p>
        </div>
        <strong>
          {tr(profile.rating)}
          <small>{tr('MMR')}</small>
        </strong>
      </section>
      <ol className="rank-grid" aria-label={tr('Rank ladder')}>
        {TIERS.map((tier, i) => {
          const active = tier.name === here.tier.name && placed;
          const earned = placed && profile.peakRating >= tier.floor;
          const ceiling = TIERS[i + 1]?.floor;
          return (
            <li
              key={tier.name}
              className={`rank-tier ${active ? 'is-current' : ''} ${earned ? 'is-earned' : ''}`}
            >
              <div className="rank-tier__top">
                <span>
                  {'0'}
                  {tr(i + 1)}
                </span>
                <span>
                  {tr(active ? 'YOUR RANK' : i === 7 ? 'THE SUMMIT' : earned ? 'REACHED' : 'AHEAD')}
                </span>
              </div>
              <RankEmblem rating={tier.floor} size={116} />
              <h2>{tr(tier.name)}</h2>
              <p>{tr(tier.blurb)}</p>
              <span className="rank-range">
                {tr(tier.floor)}
                {tr(ceiling ? `–${ceiling - 1}` : '+')}
                {tr(' MMR')}
              </span>
              <div
                className="division-marks"
                aria-label={tr(i === 7 ? 'Apex tier' : 'Divisions three to one')}
              >
                {i === 7 ? (
                  <span>{tr('APEX')}</span>
                ) : (
                  <>
                    <span>{tr('III')}</span>
                    <ChevronRight size={12} />
                    <span>{tr('II')}</span>
                    <ChevronRight size={12} />
                    <span>{tr('I')}</span>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <section className="rank-rules">
        <article>
          <span>{'01'}</span>
          <h3>{tr('Win your way up')}</h3>
          <p>
            {tr(
              'Elo measures performance against your opponent. A win against a stronger rival earns more. Five placement matches unlock your leaderboard position.',
            )}
          </p>
        </article>
        <article>
          <span>{'02'}</span>
          <h3>{tr('Know the stakes')}</h3>
          <p>
            {tr(
              'Cross a division boundary to move up or down. Your profile shows the drop line before you play. Earned achievements and XP never disappear.',
            )}
          </p>
        </article>
        <article>
          <span>{'03'}</span>
          <h3>{tr('Keep it fair')}</h3>
          <p>
            {tr(
              'Only verified ranked matches count. Both players must participate. After three rewarded matches with the same rival in 24 hours, find a new opponent.',
            )}
          </p>
        </article>
      </section>
    </main>
  );
}
