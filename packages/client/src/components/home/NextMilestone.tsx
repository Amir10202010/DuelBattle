import { ArrowRight, Check, Sparkles } from 'lucide-react';
import { COSMETICS, PLACEMENT_MATCHES, isPlaced, levelFor, nextRank, rankFor, xpToReach, type PublicProfile } from '@battle/shared';
import { tr, useUiPreferences } from '../../i18n/index.js';
import { RankEmblem } from '../GameArt.jsx';

/** Progress uses the same thresholds and catalog as settlement and the store. */
export function NextMilestone({ profile, onNavigate }: { profile: PublicProfile; onNavigate: (path: string) => void }) {
  useUiPreferences();
  const placed = isPlaced(profile.matchesPlayed);
  const next = nextRank(profile.rating);
  const rank = rankFor(profile.rating);
  const level = levelFor(profile.xp);
  const reward = COSMETICS.filter((item) => item.price === 0 && item.level && item.level > level.level)
    .sort((a, b) => a.level! - b.level!)[0];
  const progress = placed ? rank.progress : Math.min(1, profile.matchesPlayed / PLACEMENT_MATCHES);
  return <section className="milestone" aria-label={tr('Your next milestone')}>
    <div className="milestone__rank">
      <RankEmblem rating={placed ? next?.rank.floor ?? profile.rating : profile.rating} size={68} placing={!placed} />
      <div className="milestone__body">
        <span className="eyebrow">{tr(placed ? 'Next rank' : 'Claim your first rank')}</span>
        <h2>{tr(placed ? next?.rank.label ?? 'Household Name' : `${profile.matchesPlayed} of ${PLACEMENT_MATCHES} placements complete`)}</h2>
        {placed ? <div className="bar" role="progressbar" aria-label={tr('Progress to the next rank')} aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <i style={{ width: `${progress * 100}%` }} />
        </div> : <div className="placement-path" role="progressbar" aria-label={tr('Ranked placement matches')} aria-valuenow={profile.matchesPlayed} aria-valuemin={0} aria-valuemax={PLACEMENT_MATCHES}>
          {Array.from({ length: PLACEMENT_MATCHES }, (_, i) => <span key={i} className={i < profile.matchesPlayed ? 'is-complete' : i === profile.matchesPlayed ? 'is-next' : ''} aria-hidden="true">{i < profile.matchesPlayed ? <Check size={14} /> : i + 1}</span>)}
        </div>}
        <p>{tr(placed ? next ? `${next.pointsAway} rating to go` : 'Nothing above you. Defend it.' : 'Complete ranked battles to reveal your rank.')}</p>
      </div>
      <button className="icon-button" aria-label={tr('See the ladder')} onClick={() => onNavigate('/ranks')}><ArrowRight size={20} /></button>
    </div>
    <button className="milestone__reward" onClick={() => onNavigate(reward ? '/profile' : '/awards')}>
      <Sparkles size={28} aria-hidden="true" />
      <span><small>{tr(reward ? 'Next cosmetic unlock' : 'Keep growing')}</small>
        <strong>{tr(reward?.name ?? `Level ${level.level + 1}`)}</strong>
        <small>{tr(reward ? `Level ${reward.level} · ${Math.max(0, xpToReach(reward.level!) - profile.xp)} XP to go` : `${level.cost - level.into} XP to the next level`)}</small>
      </span>
      <ArrowRight size={18} />
    </button>
  </section>;
}
