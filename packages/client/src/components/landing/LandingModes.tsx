import { useState } from 'react';
import { ArrowRight, Check, Link2, Radar, Swords, Trophy, Users, Zap } from 'lucide-react';
import { TIERS } from '@battle/shared';
import { RankEmblem } from '../GameArt.js';
import { tr, useUiPreferences } from '../../i18n/index.js';
import { LandingLink } from './LandingLink.js';
const MODES = [
  {
    id: 'quick',
    Icon: Zap,
    title: 'A little friendly chaos.',
    label: 'Quick play',
    description:
      'Meet someone new. Make an unexpected move. No rating on the line, just a very good reason to play one more.',
    cta: 'Jump into quick play',
    path: '/play',
  },
  {
    id: 'friends',
    Icon: Users,
    title: 'Settle it with a friend.',
    label: 'Play with friends',
    description:
      'Send the room link. Bring the rivalry. Add your own prompts and turn an ordinary catch-up into a proper showdown.',
    cta: 'Open a friendly room',
    path: '/play',
  },
  {
    id: 'ranked',
    Icon: Trophy,
    title: 'Make a name for yourself.',
    label: 'Climb the ranks',
    description:
      'Five placement matches. Eight ranks to chase. Build your record, earn rewards, and become a household name.',
    cta: 'Start your climb',
    path: '/register',
  },
] as const;
export function LandingModes({ onNavigate }: { onNavigate: (path: string) => void }) {
  useUiPreferences();
  const [selected, setSelected] = useState(2);
  const mode = MODES[selected]!;
  return (
    <section id="ways-to-play" className="lp-modes" aria-labelledby="modes-title">
      <div className="lp-wrap lp-modes__inner">
        <div className="lp-modes__intro" data-reveal>
          <span className="lp-kicker">{tr('02 / PICK YOUR KIND OF COMPETITIVE')}</span>
          <h2 id="modes-title">
            {tr('One game.')}
            <br />
            {tr('Your kind of rivalry.')}
          </h2>
        </div>
        <div className="lp-modes__body" data-reveal>
          <div className="lp-modes__content">
            <div className="lp-mode-tabs" role="tablist" aria-label={tr('Ways to play')}>
              {MODES.map(({ id, Icon, label }, index) => (
                <button
                  key={id}
                  id={`mode-${id}`}
                  type="button"
                  role="tab"
                  aria-selected={selected === index}
                  aria-controls="mode-panel"
                  tabIndex={selected === index ? 0 : -1}
                  onClick={() => setSelected(index)}
                  onKeyDown={(event) => {
                    let next = index;
                    if (event.key === 'ArrowRight') next = (index + 1) % MODES.length;
                    else if (event.key === 'ArrowLeft')
                      next = (index + MODES.length - 1) % MODES.length;
                    else if (event.key === 'Home') next = 0;
                    else if (event.key === 'End') next = MODES.length - 1;
                    else return;
                    event.preventDefault();
                    setSelected(next);
                    document.getElementById(`mode-${MODES[next]!.id}`)?.focus();
                  }}
                >
                  <Icon size={16} />
                  <span>{tr(label)}</span>
                </button>
              ))}
            </div>
            <div
              id="mode-panel"
              role="tabpanel"
              aria-labelledby={`mode-${mode.id}`}
              tabIndex={0}
              className="lp-mode-copy"
            >
              <div key={mode.id}>
                <h3>{tr(mode.title)}</h3>
                <p>{tr(mode.description)}</p>
                <LandingLink className="lp-text-button" href={mode.path} onNavigate={onNavigate}>
                  {tr(mode.cta)}
                  <ArrowRight size={17} />
                </LandingLink>
              </div>
            </div>
          </div>
          <div className={`lp-mode-art lp-mode-art--${mode.id}`} key={mode.id}>
            {mode.id === 'ranked' ? (
              <>
                <div className="lp-mode-art__top">
                  <Trophy size={15} />
                  <span>{tr('THE CLIMB IS REAL.')}</span>
                  <span>08 {tr('RANKS')}</span>
                </div>
                <div className="lp-rank-showcase">
                  {[2, 4, 7].map((index, order) => (
                    <div key={index} className={`lp-rank lp-rank--${order}`}>
                      <RankEmblem rating={TIERS[index]!.floor} size={order === 2 ? 154 : 108} />
                      <strong>{tr(TIERS[index]!.name)}</strong>
                      <span>{TIERS[index]!.floor}+ MMR</span>
                    </div>
                  ))}
                </div>
                <div className="lp-rank-path">
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
                <p className="lp-art-note">
                  {tr('Start with five placement matches. See how far you go.')}
                </p>
              </>
            ) : mode.id === 'friends' ? (
              <>
                <div className="lp-mode-art__top">
                  <Users size={15} />
                  <span>{tr('YOUR PEOPLE. YOUR PROMPTS.')}</span>
                  <span>{tr('PRIVATE ROOM')}</span>
                </div>
                <div className="lp-invite">
                  <span className="lp-invite__avatars">
                    <span>Y</span>
                    <Swords size={26} />
                    <span>R</span>
                  </span>
                  <h3>{tr('Rivalry, by invitation.')}</h3>
                  <div className="lp-invite__link">
                    <Link2 size={16} />
                    <span>duelbattle / r / ABCDE</span>
                    <Check size={16} />
                  </div>
                  <span className="lp-art-note">
                    {tr('Example room link · your room gets its own code')}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="lp-mode-art__top">
                  <Radar size={15} />
                  <span>{tr('NO PRESSURE. ALL PLAY.')}</span>
                  <span>{tr('QUICK PLAY')}</span>
                </div>
                <div className="lp-quick-art">
                  <div className="lp-quick-art__orbit">
                    <Swords size={44} strokeWidth={1.2} />
                    <span className="lp-quick-art__you">{tr('YOU')}</span>
                    <span className="lp-quick-art__rival">?</span>
                  </div>
                  <h3>{tr('Someone out there thinks they’re faster.')}</h3>
                  <p className="lp-art-note">{tr('No rating to lose. A rivalry to find.')}</p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
