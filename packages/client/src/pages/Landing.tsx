import { BrandMark } from '../components/BrandMark.js';
import {
  ArrowDown,
  ArrowRight,
  Camera,
  Check,
  ScanLine,
  ShieldCheck,
  Swords,
  Trophy,
  Users,
  Zap,
} from 'lucide-react';
import { allChallengesPool, supportsRussian } from '@battle/shared';
import { tr, useUiPreferences } from '../i18n/index.js';
import { LandingDemo } from '../components/landing/LandingDemo.js';
import { LandingModes } from '../components/landing/LandingModes.js';
import { LandingLink } from '../components/landing/LandingLink.js';
import { useLandingMotion } from '../components/landing/useLandingMotion.js';
import '../styles/landing.css';

const STEPS = [
  {
    Icon: Users,
    title: 'A friend. Or a worthy rival.',
    text: 'Find an opponent or share a private room link. Two players. One challenge. It’s on.',
  },
  {
    Icon: ScanLine,
    title: 'Think fast. Grab faster.',
    text: 'Something red? Something round? Find your answer, show the camera, and lock it in.',
  },
  {
    Icon: Trophy,
    title: 'Make the everyday legendary.',
    text: 'The better answer takes the point. Speed breaks a close tie. First to three wins.',
  },
];
const QUESTIONS = [
  {
    question: 'What do I need to play?',
    answer:
      'A browser, a working camera, and whatever is around you. No download or microphone needed. Allow camera access when you enter a match.',
  },
  {
    question: 'Do I need an account?',
    answer:
      'You can jump into quick play or a friendly room with just a name. Create an account when you want ranked matches, saved progress, and rewards.',
  },
  {
    question: 'Who decides the winner?',
    answer:
      'Answers are checked on the server. The better match to the prompt wins; speed breaks a close tie. AI rounds receive a second check. If a ranked check is unreliable, your rating and XP stay unchanged.',
  },
  {
    question: 'What happens to my camera feed?',
    answer:
      'Camera frames are shared with your opponent. AI rounds also send snapshots to the configured referee provider. There is no microphone access or server photo archive.',
  },
];

/**
 * The rising arrow beside a headline.
 *
 * Drawn rather than typed. As the character U+2197 it was at the mercy of
 * whatever face the fallback stack landed on, and a font without the glyph
 * renders it as a hollow box — in the hero that box inherits the accent, so a
 * missing arrow showed up as a yellow square with nothing inside it.
 */
function RiseArrow({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M6.5 17.5 17.5 6.5M8.6 6.5h8.9v8.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Landing({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { locale } = useUiPreferences();
  const root = useLandingMotion();
  const challengeCount = allChallengesPool().filter(
    (c) => locale === 'en' || supportsRussian(c.prompt),
  ).length;
  return (
    <main className="lp" ref={root}>
      <section className="lp-hero lp-wrap" aria-labelledby="landing-title">
        <div className="lp-hero__copy">
          <div className="lp-kicker lp-hero__eyebrow">
            <span className="lp-signal" />
            {tr('THE REAL-WORLD 1V1 GAME')}
          </div>
          <h1 id="landing-title">
            <span>{tr('YOUR ROOM.')}</span>
            <span>{tr('THEIR')}</span>
            <span className="lp-hero__punch">
              {tr('PROBLEM.')}
              <RiseArrow className="lp-period" />
            </span>
          </h1>
          <p className="lp-hero__description">
            {tr(
              'Turn the things around you into a winning move. One rival. One camera. A whole new way to play.',
            )}
          </p>
          <div className="lp-hero__actions">
            <LandingLink className="lp-button lp-button--lime" href="/play" onNavigate={onNavigate}>
              {tr('Find your rival')}
              <ArrowRight size={19} />
            </LandingLink>
            <a className="lp-text-button" href="#how-it-works">
              {tr('How it works')}
              <ArrowDown size={16} />
            </a>
          </div>
          <p className="lp-hero__note">
            <Check size={14} />
            {tr('Free to jump in. Nothing to download.')}
          </p>
        </div>
        <div className="lp-hero__visual">
          <div className="lp-visual-label">
            <span>
              <Swords size={14} />
              {tr('TWO ROOMS. ONE ARENA.')}
            </span>
            <span>{tr('EXAMPLE ROUND')}</span>
          </div>
          <LandingDemo />
          <div className="lp-visual-caption">
            <span className="lp-caption-line" />
            <span>{tr('Yes, that mug could be your winning move.')}</span>
            <ArrowRight size={15} />
          </div>
        </div>
        <div className="lp-hero__index" aria-hidden="true">
          <span>DUELBATTLE</span>
          <span>{tr('LESS SCROLLING. MORE PLAYING.')}</span>
        </div>
      </section>
      <div className="lp-proof">
        <div className="lp-wrap lp-proof__inner">
          <div>
            <Camera size={20} />
            <span>
              {tr('Real objects.')} <strong>{tr('Real competition.')}</strong>
            </span>
          </div>
          <div>
            <strong className="lp-proof__number">{challengeCount.toLocaleString(locale)}</strong>
            <span>{tr('ways to think on your feet')}</span>
          </div>
          <div>
            <span className="lp-proof__number">
              1 <span>vs</span> 1
            </span>
            <span>{tr('A proper head-to-head.')}</span>
          </div>
          <div>
            <Zap size={19} />
            <span>{tr('All in your browser.')}</span>
          </div>
        </div>
      </div>
      <section
        id="how-it-works"
        className="lp-workflow lp-wrap lp-section"
        aria-labelledby="how-title"
      >
        <div className="lp-section-head" data-reveal>
          <div>
            <span className="lp-kicker">{tr('01 / THE GAME PLAN')}</span>
            <h2 id="how-title">
              {tr('Big rivalry.')}
              <br />
              <span className="lp-muted">{tr('Ridiculously simple.')}</span>
            </h2>
          </div>
          <p>
            {tr('Your room is already full of possibilities. All it takes is someone to beat.')}
          </p>
        </div>
        <div className="lp-steps">
          {STEPS.map(({ Icon, title, text }, index) => (
            <article key={title} className="lp-step" data-reveal>
              <div className="lp-step__top">
                <span>0{index + 1}</span>
                <Icon size={25} strokeWidth={1.5} />
              </div>
              <h3>{tr(title)}</h3>
              <p>{tr(text)}</p>
            </article>
          ))}
        </div>
      </section>
      <LandingModes onNavigate={onNavigate} />
      <section className="lp-trust lp-wrap lp-section" aria-labelledby="trust-title">
        <div className="lp-trust__copy" data-reveal>
          <span className="lp-kicker">{tr('03 / GOOD TO KNOW')}</span>
          <ShieldCheck size={40} strokeWidth={1.3} className="lp-trust__icon" />
          <h2 id="trust-title">
            {tr('Good rivalry.')}
            <br />
            <span className="lp-muted">{tr('Ground rules included.')}</span>
          </h2>
          <p>
            {tr(
              'A little competitive chaos. A clear way to play. Here’s what happens behind the camera.',
            )}
          </p>
        </div>
        <div className="lp-faq" data-reveal>
          {QUESTIONS.map(({ question, answer }, index) => (
            <details key={question}>
              <summary>
                <span className="lp-faq__number">0{index + 1}</span>
                <span>{tr(question)}</span>
                <span className="lp-faq__plus" aria-hidden="true" />
              </summary>
              <p>{tr(answer)}</p>
            </details>
          ))}
        </div>
      </section>
      <section className="lp-finale" aria-labelledby="finale-title">
        <div className="lp-wrap lp-finale__inner" data-reveal>
          <div>
            <span className="lp-kicker">{tr('YOUR NEXT GREAT RIVALRY STARTS AT HOME.')}</span>
            <h2 id="finale-title">
              {tr('GAME ON?')}
              <RiseArrow className="lp-finale__arrow" />
            </h2>
          </div>
          <div className="lp-finale__action">
            <LandingLink className="lp-button lp-button--dark" href="/play" onNavigate={onNavigate}>
              {tr('Let’s settle this')}
              <ArrowRight size={20} />
            </LandingLink>
            <span>{tr('Your camera. Your stuff. Your moment.')}</span>
          </div>
        </div>
      </section>
      <footer className="lp-footer lp-wrap">
        <a className="lp-brand" href="#landing-title" aria-label={tr('DuelBattle home')}>
          <span className="lp-brand__mark">
            <BrandMark />
          </span>
          <span>
            DUEL<span className="lp-brand__half">BATTLE</span>
          </span>
        </a>
        <span>{tr('Make a little room for rivalry.')}</span>
        <div>
          <LandingLink href="/register" onNavigate={onNavigate}>
            {tr('Create an account')}
          </LandingLink>
          <LandingLink href="/settings" onNavigate={onNavigate}>
            {tr('Settings & privacy')}
          </LandingLink>
          <span>© {new Date().getFullYear()} DuelBattle</span>
        </div>
      </footer>
    </main>
  );
}

