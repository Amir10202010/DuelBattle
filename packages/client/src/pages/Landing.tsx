import { tr, useUiPreferences } from '../i18n/index.js';
import {
  Camera,
  ArrowRight,
  ShieldCheck,
  ScanLine,
  Timer,
  Zap,
  Trophy,
  Users,
  ChevronRight,
} from 'lucide-react';
import { allChallengesPool, TIERS, supportsRussian } from '@battle/shared';
import { RankEmblem } from '../components/GameArt.jsx';

export function Landing({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { locale } = useUiPreferences();
  return (
    <main className="landing">
      <section className="landing-hero">
        <div className="hero-copy">
          <span className="eyebrow">
            <i className="live-dot" />
            {tr(' Real rooms. Real rivals.')}
          </span>
          <h1>
            {tr('Turn your room')}
            <br />
            {tr('into a ')}
            <em>{tr('rivalry.')}</em>
          </h1>
          <p>
            {tr(
              'A camera. A challenger. Twenty seconds to find something red. Your everyday stuff is about to get competitive.',
            )}
          </p>
          <div className="hero-actions">
            <button className="btn btn--primary btn--lg" onClick={() => onNavigate('/play')}>
              {tr('Let’s play ')}
              <ArrowRight size={18} />
            </button>
            <button className="text-link" onClick={() => onNavigate('/register')}>
              {tr('Create an account ')}
              <ChevronRight size={15} />
            </button>
          </div>
          <div className="hero-facts">
            <span>
              <Camera size={15} />
              {tr(' Camera only')}
            </span>
            <span>
              <Users size={15} />
              {tr(' 1 vs 1')}
            </span>
            <span>
              <Timer size={15} />
              {tr(' Quick rounds')}
            </span>
          </div>
        </div>
        <div className="demo-arena" aria-label={tr('Illustrated example of a DuelBattle round')}>
          <div className="demo-top">
            <span>
              <i className="live-dot" />
              {tr(' IN THE ARENA')}
            </span>
            <span>{tr('EXAMPLE ROUND')}</span>
          </div>
          <div className="demo-task">
            <span className="eyebrow">{tr('Find it. Show it. Beat them.')}</span>
            <h2>
              {tr('Show something ')}
              <span>{tr('red.')}</span>
            </h2>
            <div className="demo-timer">
              <i />
              <b>
                {'12.4'}
                <span>{tr('s')}</span>
              </b>
            </div>
          </div>
          <div className="demo-players">
            <div className="demo-you">
              <img src="/friends.jpg" alt={tr('A player holding a red mug to the camera')}
                width="1200" height="800" fetchPriority="high" />
              <span>
                <i className="live-dot" />
                {tr(' YOU ')}
                <b>
                  {tr('Answer verified ')}
                  <ShieldCheck size={13} />
                </b>
              </span>
            </div>
            <div className="demo-rival">
              <img
                src="/friends.jpg"
                alt={tr('A player holding a red trainer to the camera')}
                width="1200"
                height="800"
              />
              <span>
                {tr('YOUR RIVAL ')}
                <b>{tr('Answer ready')}</b>
              </span>
            </div>
            <span className="versus">{tr('VS')}</span>
          </div>
          <div className="demo-result">
            <Zap size={17} />
            <strong>{tr('Everyday objects. Unexpected victories.')}</strong>
            <span>{tr('First to 3')}</span>
          </div>
        </div>
      </section>
      <div className="landing-ribbon">
        <span>
          <ScanLine size={19} />
          {tr(' Find your edge')}
        </span>
        <span>{tr('Fast hands')}</span>
        <span>{tr('Quick thinking')}</span>
        <span>{tr('Good rivalry')}</span>
        <span>
          {tr(
            allChallengesPool()
              .filter((c) => locale === 'en' || supportsRussian(c.prompt))
              .length.toLocaleString(),
          )}
          {tr(' challenges')}
        </span>
      </div>
      <section className="landing-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">{tr('From “what?” to “got it!”')}</span>
            <h2>
              {tr('Simple rules.')}
              <br />
              {tr('Ridiculous possibilities.')}
            </h2>
          </div>
          <p>{tr('No downloads. No equipment. Just the things around you and someone to beat.')}</p>
        </div>
        <div className="how-grid">
          {[
            {
              Icon: Users,
              n: '01',
              title: 'Meet your match',
              copy: 'Jump into matchmaking or send a private room link to a friend.',
            },
            {
              Icon: Camera,
              n: '02',
              title: 'Make your move',
              copy: 'Read the prompt. Grab your answer. Hold it up and lock it in.',
            },
            {
              Icon: Trophy,
              n: '03',
              title: 'Earn the rematch',
              copy: 'The better answer wins. A close call? Speed breaks the tie.',
            },
          ].map(({ Icon, n, title, copy }) => (
            <article key={n}>
              <div>
                <Icon size={27} />
                <span>{tr(n)}</span>
              </div>
              <h3>{tr(title)}</h3>
              <p>{tr(copy)}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="landing-progression">
        <div>
          <span className="eyebrow">{tr('Build a reputation')}</span>
          <h2>
            {tr('From quick hands')}
            <br />
            {tr('to a household name.')}
          </h2>
          <p>
            {tr(
              'Find your level in five placement matches. Climb an original eight-tier ladder, unlock achievements, and turn a good evening into a great record.',
            )}
          </p>
          <button className="text-link" onClick={() => onNavigate('/register')}>
            {tr('Start your climb ')}
            <ArrowRight size={16} />
          </button>
        </div>
        <div className="landing-ranks">
          {[2, 4, 7].map((i) => (
            <div key={i}>
              <RankEmblem rating={TIERS[i]!.floor} size={i === 7 ? 134 : 106} />
              <strong>{tr(TIERS[i]!.name)}</strong>
              <span>
                {tr(TIERS[i]!.floor)}
                {tr('+ MMR')}
              </span>
            </div>
          ))}
        </div>
      </section>
      <section className="landing-section">
        <div className="fair-grid">
          <ShieldCheck size={40} />
          <div>
            <span className="eyebrow">{tr('Rivalry, with respect')}</span>
            <h2>
              {tr('Your opponent is a rival.')}
              <br />
              {tr('Your rating has a referee.')}
            </h2>
            <p>
              {tr(
                'Ranked answers are checked on the server. AI rounds get an independent second check. If a check cannot be trusted, the match changes no rating or XP. Friendly custom rounds stay outside the ladder.',
              )}
            </p>
            <p className="fine-print">
              {tr(
                'Camera frames are shared with your opponent. AI rounds also send snapshots to the configured referee provider. No microphone. No server photo archive.',
              )}
            </p>
          </div>
        </div>
      </section>
      <section className="landing-cta">
        <span className="eyebrow">{tr('The next great rivalry starts somewhere.')}</span>
        <h2>{tr('Why not in your room?')}</h2>
        <button className="btn btn--primary btn--lg" onClick={() => onNavigate('/register')}>
          {tr('Let’s battle ')}
          <ArrowRight size={18} />
        </button>
      </section>
    </main>
  );
}
