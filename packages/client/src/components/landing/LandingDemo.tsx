import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Crosshair,
  Camera,
  Pause,
  Play,
  RotateCcw,
  ScanLine,
  ShieldCheck,
  Trophy,
} from 'lucide-react';
import { tr, useUiPreferences } from '../../i18n/index.js';
const LAST_TICK = 12;

export function LandingDemo() {
  useUiPreferences();
  const [tick, setTick] = useState(LAST_TICK);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(true);
  const [documentVisible, setDocumentVisible] = useState(true);
  const [reduced, setReduced] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const motion = () => {
      setReduced(media.matches);
      setTick(media.matches ? LAST_TICK : 0);
    };
    motion();
    media.addEventListener('change', motion);
    const visibility = () => setDocumentVisible(!document.hidden);
    visibility();
    document.addEventListener('visibilitychange', visibility);
    const observer =
      'IntersectionObserver' in window
        ? new IntersectionObserver(([entry]) => setVisible(Boolean(entry?.isIntersecting)))
        : null;
    if (root.current) observer?.observe(root.current);
    return () => {
      media.removeEventListener('change', motion);
      document.removeEventListener('visibilitychange', visibility);
      observer?.disconnect();
    };
  }, []);
  useEffect(() => {
    if (paused || reduced || !visible || !documentVisible || tick >= LAST_TICK) return;
    const timer = window.setTimeout(() => setTick((current) => current + 1), 450);
    return () => window.clearTimeout(timer);
  }, [tick, paused, reduced, visible, documentVisible]);
  const locked = tick >= 6;
  const won = tick >= LAST_TICK;
  const status = won ? 'Round won' : locked ? 'Checking answers' : 'Find your answer';
  return (
    <div
      ref={root}
      className={`lp-demo ${locked ? 'lp-demo--locked' : ''} ${won ? 'lp-demo--won' : ''}`}
      aria-label={tr('Illustrated example of a DuelBattle round')}
    >
      <div className="lp-demo__chrome">
        <span>
          <span className="lp-signal" />
          {tr('ROUND 01')}
          <span className="lp-demo__divider">/</span>
          {tr('FIRST TO 3')}
        </span>
        <span className="lp-demo__example">{tr('INTERACTIVE PREVIEW')}</span>
      </div>
      <div className="lp-demo__prompt">
        <div>
          <span className="lp-demo__label">{tr('YOUR CHALLENGE')}</span>
          <h2>
            {tr('Show something')} <span>{tr('red.')}</span>
          </h2>
        </div>
        <div className="lp-demo__clock" aria-label={tr('Example round timer')}>
          <span>{locked ? '12.4' : (20 - tick * 1.26).toFixed(1)}</span>
          <small>{tr('SEC')}</small>
        </div>
      </div>
      <div className="lp-demo__feeds">
        <div className="lp-feed lp-feed--you">
          <div className="lp-feed__photo">
            <img
              src="/friends.jpg"
              alt={tr('A player holding a red mug to the camera')}
              width="1200"
              height="800"
              fetchPriority="high"
            />
          </div>
          <div className="lp-feed__top">
            <span>
              <span className="lp-feed__dot" />
              {tr('YOU')}
            </span>
            <Camera size={13} />
          </div>
          <div className="lp-feed__target" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <span className="lp-feed__scan" />
          </div>
          <div className="lp-feed__object">
            <ScanLine size={12} />
            {tr('RED MUG')}
            {locked && <Check size={12} />}
          </div>
          <div className="lp-feed__bottom">
            <span>
              {tr('Good eye.')}
              <strong>{tr('Even better answer.')}</strong>
            </span>
            <span className="lp-feed__score">
              {locked ? '96' : '—'}
              <small>/100</small>
            </span>
          </div>
        </div>
        <div className="lp-feed lp-feed--rival">
          <div className="lp-feed__photo">
            <img
              src="/friends.jpg"
              alt={tr('A player holding a red trainer to the camera')}
              width="1200"
              height="800"
            />
          </div>
          <div className="lp-feed__top">
            <span>
              <span className="lp-feed__dot" />
              {tr('RIVAL')}
            </span>
            <Camera size={13} />
          </div>
          <div className="lp-feed__object">
            <ScanLine size={12} />
            {tr('RED TRAINER')}
            {locked && <Check size={12} />}
          </div>
          <div className="lp-feed__bottom">
            <span>
              {tr('A worthy opponent.')}
              <strong>{tr('Almost.')}</strong>
            </span>
            <span className="lp-feed__score">
              {locked ? '82' : '—'}
              <small>/100</small>
            </span>
          </div>
        </div>
        <span className="lp-demo__vs" aria-hidden="true">
          VS
        </span>
      </div>
      <div className="lp-demo__status">
        <div>
          {won ? (
            <Trophy size={17} />
          ) : locked ? (
            <ShieldCheck size={17} />
          ) : (
            <Crosshair size={17} />
          )}
          <span>{tr(status)}</span>
          {won && <span className="lp-demo__point">+1</span>}
        </div>
        <button
          type="button"
          onClick={() => {
            if (won) {
              setTick(reduced ? LAST_TICK : 0);
              setPaused(false);
            } else setPaused((value) => !value);
          }}
          disabled={reduced}
          aria-label={tr(
            won ? 'Replay example round' : paused ? 'Resume example round' : 'Pause example round',
          )}
        >
          {won ? <RotateCcw size={13} /> : paused ? <Play size={13} /> : <Pause size={13} />}
          <span>{tr(won ? 'Replay round' : paused ? 'Resume' : 'Pause')}</span>
        </button>
      </div>
      <div className="lp-demo__progress" aria-hidden="true">
        <span style={{ transform: `scaleX(${won ? 1 : tick / LAST_TICK})` }} />
      </div>
    </div>
  );
}
