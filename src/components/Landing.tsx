import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Camera,
  Check,
  Link2,
  MoveUpRight,
  ShieldCheck,
  Sparkles,
  Trophy,
  Zap,
} from 'lucide-react';
import { useState } from 'react';
import type { Profile } from '../../shared/protocol';
import { CHALLENGES } from '../../shared/challenges';
import { extractRoomCode } from '../../shared/identity';
import { Brand } from './Brand';

/**
 * An invite link is the common path, but a code read out over a call has to work
 * too — so this accepts either, and says plainly when it has neither.
 */
function JoinForm({ onJoin }: { onJoin: (code: string) => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="join-code"
      onSubmit={(event) => {
        event.preventDefault();
        const code = extractRoomCode(value);
        if (!code) setError('That is not a battle code. Paste the invite link instead.');
        else onJoin(code);
      }}
    >
      <label htmlFor="join-code-input">Got an invite? Paste the code or link</label>
      <div>
        <input
          id="join-code-input"
          value={value}
          spellCheck={false}
          autoComplete="off"
          placeholder="A1B2C3D4E5"
          aria-describedby={error ? 'join-code-error' : undefined}
          onChange={(event) => {
            setValue(event.target.value);
            setError(null);
          }}
        />
        <button className="button button-dark">
          Join <ArrowRight size={17} />
        </button>
      </div>
      {error && (
        <p id="join-code-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

export function Landing({
  profile,
  connected,
  onStart,
  onJoin,
  onInfo,
}: {
  profile: Profile | null;
  connected: boolean;
  onStart: () => void;
  onJoin: (code: string) => void;
  onInfo: (kind: 'rules' | 'privacy') => void;
}) {
  return (
    <div className="landing">
      <header className="site-header">
        <Brand />
        <nav aria-label="Main navigation">
          <a href="#how-it-works">How to play</a>
          <a href="#challenges">The challenges</a>
          <button className="button button-small button-dark" onClick={onStart}>
            Start a Battle <ArrowUpRight size={16} />
          </button>
        </nav>
      </header>
      <main id="main-content">
        <section className="hero page-width">
          <div className="hero-copy">
            <div className="eyebrow hero-eyebrow">
              <span className="tiny-cross">✳</span> REAL FRIENDS. REAL-TIME RIVALRY.
            </div>
            <h1>
              Your room
              <br />
              is the{' '}
              <span className="arena-word">
                arena<span className="word-period">.</span>
              </span>
            </h1>
            <p className="hero-description">
              Challenge your friends to fast 1v1 battles
              <br className="desktop-break" /> through your camera. Ordinary stuff.
              <br className="desktop-break" /> Unreasonably competitive.
            </p>
            <div className="hero-actions">
              <button className="button button-lime button-large" onClick={onStart}>
                Start a Battle <ArrowUpRight size={22} />
              </button>
              <a className="text-link" href="#how-it-works">
                See how it works <ArrowDown size={17} />
              </a>
            </div>
            <JoinForm onJoin={onJoin} />
            <div className="hero-fine">
              <Camera size={15} />
              <span>2 players</span>
              <span className="separator">/</span>
              <span>First to 3 wins</span>
              <span className="separator">/</span>
              <span>100% friendly. Mostly.</span>
            </div>
          </div>
          <div className="hero-scene">
            <div className="scene-topline">
              <span>THIS COULD GET PERSONAL</span>
              <span>01 / 05</span>
            </div>
            <div className="scene-photo">
              <img
                src="/friends.png"
                alt="Illustration of two friends laughing in separate rooms, one presenting a red mug and the other a red sneaker"
                fetchPriority="high"
                width="1536"
                height="1024"
              />
              <div className="scene-vs">VS</div>
              <div className="scene-player scene-player-one">THE MUG PERSON</div>
              <div className="scene-player scene-player-two">THE SHOE PERSON</div>
            </div>
            <div className="scene-challenge">
              <span className="example-label">
                <Zap size={14} fill="currentColor" /> EXAMPLE CHALLENGE
              </span>
              <span>
                SHOW SOMETHING <em>RED.</em>
              </span>
              <MoveUpRight size={32} />
            </div>
            <div className="scene-caption">
              <span>One challenge. Two very different solutions.</span>
              <span className="photo-credit">Illustrative scene</span>
            </div>
            <div className="hero-sticker" aria-hidden="true">
              LESS SCROLL.
              <br />
              MORE CHAOS.
            </div>
          </div>
        </section>
        <div className="game-strip" aria-hidden="true">
          <span>SEE IT</span>
          <span>✳</span>
          <span>GRAB IT</span>
          <span>✳</span>
          <span>SHOW IT</span>
          <span>✳</span>
          <span>WIN IT</span>
          <span>✳</span>
          <span>REMATCH</span>
          <span>↗</span>
        </div>
        <section id="how-it-works" className="how-section page-width">
          <div className="section-heading">
            <div>
              <span className="eyebrow">THE RULES ARE SIMPLE</span>
              <h2>
                A little panic.
                <br />A lot of fun.
              </h2>
            </div>
            <p>
              All you need is a friend, a camera,
              <br />
              and whatever’s within reach.
            </p>
          </div>
          <div className="steps">
            <article>
              <span className="step-number">01</span>
              <Link2 size={26} />
              <h3>Call out a friend.</h3>
              <p>Open an arena. Send the link. Your friend joins right in their browser.</p>
            </article>
            <article>
              <span className="step-number">02</span>
              <Camera size={26} />
              <h3>Camera on. Game on.</h3>
              <p>You both get the same challenge. Find your answer and show it to the camera.</p>
            </article>
            <article>
              <span className="step-number">03</span>
              <Trophy size={26} />
              <h3>Claim the bragging rights.</h3>
              <p>
                Confirm each other’s snapshots. The first valid one wins. First to three takes the
                battle.
              </p>
            </article>
          </div>
        </section>
        <section id="challenges" className="challenges-section">
          <div className="page-width">
            <div className="section-heading">
              <div>
                <span className="eyebrow">EXPECT THE UNEXPECTED</span>
                <h2>
                  Your junk drawer
                  <br />
                  has been training for this.
                </h2>
              </div>
              <span className="challenge-count">
                {CHALLENGES.length} challenges.
                <br />
                Zero preparation required.
              </span>
            </div>
            <div className="challenge-posters">
              <article className="poster poster-red">
                <span>01 — COLOR</span>
                <h3>
                  Show
                  <br />
                  something
                  <br />
                  <em>red.</em>
                </h3>
                <div>
                  <span>20 SECONDS</span>
                  <ArrowUpRight />
                </div>
              </article>
              <article className="poster poster-lime">
                <span>02 — OBJECT + ACTION</span>
                <h3>
                  Put something
                  <br />
                  blue on
                  <br />
                  <em>your head.</em>
                </h3>
                <div>
                  <span>YES, REALLY.</span>
                  <ArrowUpRight />
                </div>
              </article>
              <article className="poster poster-white">
                <span>03 — PERSONAL</span>
                <h3>
                  Find something
                  <br />
                  <em>
                    older
                    <br />
                    than you.
                  </em>
                </h3>
                <div>
                  <span>A STORY COUNTS.</span>
                  <ArrowUpRight />
                </div>
              </article>
            </div>
            <p className="safe-play">
              <ShieldCheck size={17} /> Stay within reach. Use safe objects. Walking speed wins our
              respect.
            </p>
          </div>
        </section>
        <section className="fair-section page-width">
          <div className="fair-icon">
            <ShieldCheck size={38} strokeWidth={1.5} />
          </div>
          <div>
            <span className="eyebrow">GOOD GAMES NEED GOOD SPORTS</span>
            <h2>
              Show it. Prove it.
              <br />
              Keep it friendly.
            </h2>
          </div>
          <div className="fair-copy">
            <p>
              Hold your answer up to the camera and send a snapshot. Your friend confirms it; the
              server keeps the clock and score.
            </p>
            <p>
              On-device color guidance helps you frame your answer. Personal and creative challenges
              need human judgment. No all-knowing AI referee. No background recording.
            </p>
            <button className="text-link" onClick={() => onInfo('rules')}>
              Read the house rules <ArrowRight size={17} />
            </button>
          </div>
        </section>
        <section className="plans-section page-width">
          <div className="section-heading">
            <div>
              <span className="eyebrow">BIG RIVALRY. SMALL COMMITMENT.</span>
              <h2>Play for the fun of it.</h2>
            </div>
          </div>
          <div className="plan-grid">
            <article className="plan-free">
              <div>
                <span className="eyebrow">THE EVERYDAY RIVAL</span>
                <h3>
                  Free<span>$0</span>
                </h3>
                <p>Three battles a day. Plenty of bragging rights.</p>
              </div>
              <ul>
                <li>
                  <Check size={17} /> 3 battles per day
                </li>
                <li>
                  <Check size={17} /> All {CHALLENGES.length} house challenges
                </li>
                <li>
                  <Check size={17} /> Private invite links & rematches
                </li>
              </ul>
              <button className="button button-dark" onClick={onStart}>
                Let’s play <ArrowUpRight size={18} />
              </button>
            </article>
            <article className="plan-premium">
              <div>
                <span className="eyebrow">FOR THE FRIEND GROUP LEGEND</span>
                <h3>
                  Premium<span className="coming-label">COMING LATER</span>
                </h3>
                <p>More ways to make it personal.</p>
              </div>
              <ul>
                <li>
                  <Sparkles size={17} /> No daily battle cap, with fair-use limits
                </li>
                <li>
                  <Sparkles size={17} /> Your own reviewed challenges
                </li>
                <li>
                  <Sparkles size={17} /> Advanced modes & customization
                </li>
              </ul>
              <p className="premium-note">In the works. No subscriptions or payments to buy yet.</p>
            </article>
          </div>
        </section>
        <section className="last-call">
          <div className="page-width">
            <span className="eyebrow">YOUR FRIEND THINKS THEY’LL WIN.</span>
            <h2>Prove them wrong.</h2>
            <button className="button button-lime button-large" onClick={onStart}>
              Start a Battle <ArrowUpRight size={22} />
            </button>
            <p>
              {profile?.remaining === 0
                ? 'Your next free battles arrive at midnight UTC.'
                : profile?.plan === 'premium'
                  ? 'Premium entitlements active on this device.'
                  : `${profile?.remaining ?? 3} free battles ${profile ? 'left today' : 'per day'}. No download needed.`}
            </p>
          </div>
        </section>
      </main>
      <footer className="site-footer page-width">
        <Brand />
        <span>Made for the “one more round” people.</span>
        <div>
          <button onClick={() => onInfo('privacy')}>Privacy</button>
          <button onClick={() => onInfo('rules')}>House rules</button>
          <span className={`server-status ${connected ? 'online' : ''}`}>
            {connected ? 'Arena online' : 'Connecting…'}
          </span>
        </div>
      </footer>
    </div>
  );
}
