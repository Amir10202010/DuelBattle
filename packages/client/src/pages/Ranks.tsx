import { tr, useUiPreferences } from '../i18n/index.js';
import { useState } from 'react';
import { Check, LockKeyhole } from 'lucide-react';
import {
  TIERS,
  isPlaced,
  rankFor,
  nextRank,
  type PublicProfile,
  type Tier,
} from '@battle/shared';
import { RankEmblem } from '../components/GameArt.jsx';
import { Dialog } from '../components/Dialog.jsx';

/**
 * The ladder, as eight things you can hold rather than eight paragraphs.
 *
 * Each tile is an emblem, a name and a range. What the tier is called in
 * flavour, which divisions it has and how far off it is goes in the sheet, so
 * the page reads at a glance and still answers the question when asked.
 */
export function Ranks({ profile }: { profile: PublicProfile | null }) {
  useUiPreferences();
  const [open, setOpen] = useState<string | null>(null);
  if (!profile) return null;

  const here = rankFor(profile.rating);
  const up = nextRank(profile.rating);
  const placed = isPlaced(profile.matchesPlayed);
  const selected = TIERS.find((tier) => tier.name === open) ?? null;

  return (
    <main className="page ranks">
      <header className="page__head">
        <h1 className="page__title display">{tr('A reputation you can earn.')}</h1>
      </header>

      <section className="standing plate">
        <RankEmblem rating={profile.rating} placing={!placed} size={112} />
        <div>
          <h2 className="display">{tr(placed ? here.label : 'Placement in progress')}</h2>
          <div
            className="bar"
            role="progressbar"
            aria-valuenow={Math.round(here.progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={tr('Progress through this rank')}
          >
            <i style={{ width: `${Math.round(here.progress * 100)}%` }} />
          </div>
          <p className="dim">
            {tr(
              placed
                ? up
                  ? `${up.pointsAway} rating until ${tr(up.rank.label)}`
                  : 'Welcome to the summit.'
                : `${profile.matchesPlayed} of 5 placement battles played.`,
            )}
          </p>
        </div>
        <strong className="standing__value num">
          {profile.rating}
          <small>{tr('rating')}</small>
        </strong>
      </section>

      <ol className="tiers" aria-label={tr('Rank ladder')}>
        {TIERS.map((tier, i) => {
          const active = tier.name === here.tier.name && placed;
          const earned = placed && profile.peakRating >= tier.floor;
          const ceiling = TIERS[i + 1]?.floor;
          return (
            <li key={tier.name}>
              <button
                className={`tier plate ${active ? 'is-current' : ''} ${earned ? 'is-earned' : ''}`}
                onClick={() => setOpen(tier.name)}
              >
                <span className="tier__state">
                  {active ? (
                    tr('You')
                  ) : earned ? (
                    <Check size={13} />
                  ) : (
                    <LockKeyhole size={11} />
                  )}
                </span>
                <RankEmblem rating={tier.floor} size={92} />
                <strong>{tr(tier.name)}</strong>
                <span className="tier__range num">
                  {tier.floor}
                  {ceiling ? `–${ceiling - 1}` : '+'}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <Dialog
        open={Boolean(selected)}
        onClose={() => setOpen(null)}
        title={selected ? tr(selected.name) : ''}
      >
        {selected && <TierDetail tier={selected} profile={profile} placed={placed} />}
      </Dialog>
    </main>
  );
}

function TierDetail({
  tier,
  profile,
  placed,
}: {
  tier: Tier;
  profile: PublicProfile;
  placed: boolean;
}) {
  useUiPreferences();
  const index = TIERS.indexOf(tier);
  const ceiling = TIERS[index + 1]?.floor;
  const apex = index === TIERS.length - 1;
  const away = tier.floor - profile.rating;

  return (
    <div className="tier-detail">
      <RankEmblem rating={tier.floor} size={120} />
      <h2 className="display">{tr(tier.name)}</h2>
      <p>{tr(tier.blurb)}</p>

      <div className="award-detail__facts">
        <div>
          <span className="eyebrow">{tr('Rating')}</span>
          <strong className="num">
            {tier.floor}
            {ceiling ? `–${ceiling - 1}` : '+'}
          </strong>
        </div>
        <div>
          <span className="eyebrow">{tr('Divisions')}</span>
          <strong>{apex ? tr('Apex') : 'III · II · I'}</strong>
        </div>
      </div>

      <p className="tier-detail__where">
        {tr(
          !placed
            ? 'Finish placement to take your first rank.'
            : away > 0
              ? `${away} rating away.`
              : profile.peakRating >= tier.floor
                ? 'Reached.'
                : 'Behind you.',
        )}
      </p>
    </div>
  );
}
