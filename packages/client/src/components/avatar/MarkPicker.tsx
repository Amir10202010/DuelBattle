import { AVATAR_COLORS, AVATAR_SHAPES, normalizeAvatar, type Avatar as AvatarValue } from '@battle/shared';
import type { MatchStore } from '../../net/store.js';
import { tr, useUiPreferences } from '../../i18n/index.js';
import { Avatar } from '../Identity.jsx';

/**
 * The mark that labels you on the ladder.
 *
 * It lives beside the hero rather than in settings: a player has one idea of
 * "how I look", and splitting it between a wardrobe and a preferences page made
 * the settings screen own half an identity it could not show.
 */
export function MarkPicker({ avatar, store }: { avatar: AvatarValue | undefined; store: MatchStore }) {
  useUiPreferences();
  const mark = normalizeAvatar(avatar);
  return (
    <section className="markpicker plate">
      <div className="markpicker__preview">
        <Avatar avatar={mark} size={56} />
        <span className="eyebrow">{tr('Ladder mark')}</span>
      </div>
      <div className="markpicker__rows">
        <div className="markpicker__row" role="group" aria-label={tr('Shape')}>
          {AVATAR_SHAPES.map((_, shape) => (
            <button
              key={shape}
              type="button"
              className={mark.shape === shape ? 'is-active' : ''}
              aria-pressed={mark.shape === shape}
              aria-label={tr(`Shape ${shape + 1}`)}
              onClick={() => store.saveProfile({ avatar: { ...mark, shape } })}
            >
              <Avatar avatar={{ ...mark, shape }} size={24} />
            </button>
          ))}
        </div>
        <div className="markpicker__row" role="group" aria-label={tr('Colour')}>
          {AVATAR_COLORS.map((hex, color) => (
            <button
              key={hex}
              type="button"
              className={`markpicker__swatch ${mark.color === color ? 'is-active' : ''}`}
              style={{ background: hex }}
              aria-pressed={mark.color === color}
              aria-label={tr(`Colour ${color + 1}`)}
              onClick={() => store.saveProfile({ avatar: { ...mark, color } })}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
