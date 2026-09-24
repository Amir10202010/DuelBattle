import type { CSSProperties, ReactNode } from 'react';
import { cosmetic, type Loadout } from '@battle/shared';
import { tr, useUiPreferences } from '../../i18n/index.js';

/** The CSS a banner item paints with, or nothing for a player without one. */
export function bannerStyle(loadout: Loadout | undefined): CSSProperties | undefined {
  const banner = cosmetic(loadout?.banner);
  if (!banner || banner.slot !== 'banner') return undefined;
  return { '--banner-a': banner.color, '--banner-b': banner.secondary ?? banner.color } as CSSProperties;
}

/** The title a loadout is wearing, translated, or null. */
export function titleOf(loadout: Loadout | undefined): { text: string; color: string } | null {
  const title = cosmetic(loadout?.title);
  return title && title.slot === 'title' ? { text: tr(title.name), color: title.color } : null;
}

/**
 * A name on a plate: the banner behind it and the title under it.
 *
 * Both are pure identity — they are drawn for the opponent on the versus
 * screen and on the result, which is the whole reason anybody wants one.
 */
export function PlayerPlate({
  name,
  loadout,
  children,
  className = '',
}: {
  name: string;
  loadout: Loadout | undefined;
  children?: ReactNode;
  className?: string;
}) {
  useUiPreferences();
  const banner = cosmetic(loadout?.banner);
  const title = titleOf(loadout);
  return (
    <div className={`player-plate ${banner ? `banner-pattern--${banner.pattern ?? 'stripes'} has-banner` : ''} ${className}`} style={bannerStyle(loadout)}>
      <strong className="player-plate__name">{name}</strong>
      {title && (
        <span className="player-plate__title" style={{ '--title-color': title.color } as CSSProperties}>
          {title.text}
        </span>
      )}
      {children}
    </div>
  );
}
