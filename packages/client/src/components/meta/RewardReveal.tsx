import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { CHESTS, chestOdds, cosmetic, type Granted } from '@battle/shared';
import { tr, useUiPreferences } from '../../i18n/index.js';
import { sound } from '../../media/sound.js';
import { useOptionalMeta } from '../../hooks/useMeta.js';
import { ChestArt, RewardChip } from './RewardChip.jsx';

type Stage = 'shake' | 'burst' | 'items' | 'done';

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * What came out of a claim, a chest or a purchase, given its moment.
 *
 * The order is the order of anticipation: a chest rattles, bursts, and only
 * then do its contents arrive one at a time, each with its own sound, the
 * rarest last. Nothing here decides anything — the server already did, and
 * this replays it — so skipping straight to the end loses nothing but the fun.
 */
export function RewardReveal() {
  useUiPreferences();
  const meta = useOptionalMeta();
  const reveal = meta?.reveal ?? null;
  const chest = useMemo(
    () => reveal?.granted.find((entry): entry is Extract<Granted, { kind: 'chest' }> => entry.kind === 'chest') ?? null,
    [reveal],
  );
  /** Everything to show, chest contents flattened in, rarest last. */
  const items = useMemo(() => {
    if (!reveal) return [];
    const flat = reveal.granted.flatMap((entry) => (entry.kind === 'chest' ? entry.contents : [entry]));
    const weight = (entry: Granted) =>
      entry.kind === 'item' ? 10 + ['common', 'rare', 'epic', 'legendary'].indexOf(cosmetic(entry.itemId)?.rarity ?? 'common') : entry.kind === 'gems' ? 2 : 1;
    return [...flat].sort((a, b) => weight(a) - weight(b));
  }, [reveal]);
  const [stage, setStage] = useState<Stage>('done');
  const [shown, setShown] = useState(0);
  const collect = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const animationTimers = useRef<number[]>([]);

  useEffect(() => {
    if (!reveal) return;
    const element = dialog.current;
    element?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      element?.close();
      document.body.style.overflow = overflow;
    };
  }, [reveal?.id]);

  useEffect(() => {
    if (!reveal) return;
    const quick = reducedMotion();
    setShown(quick ? items.length : 0);
    setStage(quick ? 'done' : chest ? 'shake' : 'items');
    const timers: number[] = [];
    animationTimers.current = timers;
    const at = (ms: number, run: () => void) => timers.push(window.setTimeout(run, ms));
    if (quick) {
      sound.play('reward');
      return () => timers.forEach(clearTimeout);
    }
    let t = 0;
    if (chest) {
      sound.play('chestShake');
      at(420, () => sound.play('chestShake'));
      at(900, () => {
        setStage('burst');
        sound.play('chestOpen');
      });
      t = 1300;
    }
    items.forEach((entry, index) => {
      at(t + index * 420, () => {
        setStage('items');
        setShown(index + 1);
        const rare = entry.kind === 'item' && ['epic', 'legendary'].includes(cosmetic(entry.itemId)?.rarity ?? '');
        sound.play(rare ? 'rareReveal' : entry.kind === 'gems' ? 'gem' : entry.kind === 'item' ? 'claim' : 'coin');
      });
    });
    at(t + items.length * 420 + 200, () => setStage('done'));
    return () => timers.forEach(clearTimeout);
  }, [reveal, chest, items]);

  useEffect(() => {
    if (stage === 'done') collect.current?.focus();
  }, [stage]);

  if (!reveal || !meta) return null;
  const finish = () => {
    if (stage !== 'done') {
      animationTimers.current.forEach(clearTimeout);
      setShown(items.length);
      setStage('done');
      return;
    }
    meta.dismissReveal();
  };

  return (
    <dialog ref={dialog} className={`reveal reveal--${stage}`} aria-modal="true" aria-label={tr(reveal.title)}
      onCancel={(event) => { event.preventDefault(); finish(); }} onClick={finish}>
      <div className="reveal__rays" aria-hidden="true" />
      <div className="reveal__panel" onClick={(event) => event.stopPropagation()}>
        <p className="eyebrow reveal__eyebrow">{tr(reveal.title)}</p>
        {chest && (
          <div className="reveal__chest">
            <ChestArt id={chest.chestId} size={148} open={stage !== 'shake'} />
            <span className="reveal__chest-name">{tr(CHESTS[chest.chestId].name)}</span>
            {stage !== 'shake' && (
              <span className="reveal__burst" aria-hidden="true">
                {Array.from({ length: 14 }, (_, i) => (
                  <i key={i} style={{ '--i': i } as CSSProperties} />
                ))}
              </span>
            )}
          </div>
        )}
        <ul className="reveal__items" aria-live="polite">
          {items.slice(0, shown).map((entry, index) => (
            <li key={index} className="reveal__item" style={{ '--i': index } as CSSProperties}>
              <RewardChip reward={entry} />
            </li>
          ))}
        </ul>
        {chest && stage === 'done' && (
          <details className="reveal__odds">
            <summary>{tr('What could be inside')}</summary>
            <ul>
              {chestOdds(chest.chestId).map((line) => (
                <li key={line.label}>
                  <span>{tr(line.label)}</span>
                  <b>{Math.round(line.chance * 100)}%</b>
                </li>
              ))}
            </ul>
          </details>
        )}
        <button ref={collect} className="btn btn--primary btn--lg reveal__collect" onClick={finish}>
          {tr(stage === 'done' ? 'Collect' : 'Skip')}
        </button>
      </div>
    </dialog>
  );
}
