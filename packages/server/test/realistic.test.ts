import { describe, expect, it } from 'vitest';
import { CHALLENGES, type Challenge } from '@battle/shared';
import { decodeEvidence, verifySubmission } from '../src/verify.js';
import {
  FURNITURE,
  GREY,
  passingSceneFor,
  realisticEmptyRoom,
  realisticHeld,
  scene,
  type SceneOptions,
} from './helpers.js';

const AUTO = CHALLENGES.filter((c): c is Challenge & { detector: NonNullable<Challenge['detector']> } =>
  Boolean(c.detector),
);

/**
 * Rooms a camera might actually be pointed at.
 *
 * Flat colour blocks flatter a detector that thresholds on per-pixel change and
 * on hue: no noise to trip the change threshold, no vignette to pull the
 * corners out of a colour's range, no exposure to argue with. These are the
 * conditions the game is really played in.
 */
const ROOMS: [string, SceneOptions][] = [
  ['a good webcam', { noise: 6, vignette: 0.15, exposure: 1, seed: 1 }],
  ['a cheap laptop camera', { noise: 16, vignette: 0.35, exposure: 0.95, seed: 2 }],
  ['a dim room in the evening', { noise: 14, vignette: 0.3, exposure: 0.55, seed: 3 }],
  ['a bright room by a window', { noise: 8, vignette: 0.2, exposure: 1.35, seed: 4 }],
  ['one lamp on in the corner', { noise: 14, vignette: 0.3, exposure: 0.4, seed: 5 }],
];

describe('detection through a real camera', () => {
  for (const [label, room] of ROOMS) {
    describe(label, () => {
      it('does not score a still room, however noisy', () => {
        // Two separate captures of the same untouched scene: different noise,
        // different JPEG. Nothing has happened, and nothing should count.
        const baseline = decodeEvidence(realisticEmptyRoom({ ...room, seed: (room.seed ?? 0) + 10 }));
        const submitted = decodeEvidence(realisticEmptyRoom({ ...room, seed: (room.seed ?? 0) + 20 }));
        for (const challenge of AUTO) {
          const outcome = verifySubmission(challenge, baseline, submitted);
          expect(outcome.kind).toBe('verdict');
          if (outcome.kind !== 'verdict') continue;
          expect(outcome.verdict.matched, `${label}: ${challenge.prompt}`).toBe(false);
        }
      });

      /**
       * A genuine answer must never be *wrongly rejected*. It may be handed to
       * the opponent instead — in a room lit by one lamp, "darker than your
       * room" is not a thing a camera can settle — but telling someone holding
       * the right object that they are wrong is the one outcome that is never
       * acceptable.
       */
      it('never wrongly rejects a genuine answer', () => {
        const baseline = decodeEvidence(realisticEmptyRoom(room));
        for (const challenge of AUTO) {
          const submitted = decodeEvidence(
            realisticHeld(passingSceneFor(challenge.detector), { ...room, seed: (room.seed ?? 0) + 30 }),
          );
          const outcome = verifySubmission(challenge, baseline, submitted);
          if (outcome.kind === 'undecidable') continue;
          expect(outcome.kind).toBe('verdict');
          if (outcome.kind !== 'verdict') continue;
          expect(outcome.verdict.matched, `${label}: ${challenge.prompt} — ${outcome.verdict.reason}`).toBe(
            true,
          );
        }
      });

      it('decides the overwhelming majority of rounds itself', () => {
        // Handing rounds to the opponent is the honest fallback, not a habit.
        const baseline = decodeEvidence(realisticEmptyRoom(room));
        const undecided = AUTO.filter((challenge) => {
          const submitted = decodeEvidence(
            realisticHeld(passingSceneFor(challenge.detector), { ...room, seed: (room.seed ?? 0) + 30 }),
          );
          return verifySubmission(challenge, baseline, submitted).kind === 'undecidable';
        });
        expect(undecided.length / AUTO.length).toBeLessThan(0.2);
      });
    });
  }

  it('is not fooled by the lights changing', () => {
    // Someone turns a lamp on mid-round. The whole frame shifts, but nothing
    // was brought into shot and nothing should score.
    const room: SceneOptions = { noise: 9, vignette: 0.25, seed: 7 };
    const baseline = decodeEvidence(realisticEmptyRoom({ ...room, exposure: 0.7 }));
    const brighter = decodeEvidence(realisticEmptyRoom({ ...room, exposure: 1.15, seed: 8 }));

    const colourRounds = AUTO.filter((c) => c.detector.kind === 'color');
    const fooled = colourRounds.filter((challenge) => {
      const outcome = verifySubmission(challenge, baseline, brighter);
      return outcome.kind === 'verdict' && outcome.verdict.matched;
    });
    expect(fooled.map((c) => c.prompt)).toEqual([]);
  });

  it('does not let the furniture answer for you', () => {
    // The room already contains something red and something brown. Holding up
    // a plain grey card must not win a colour round on their account.
    const room: SceneOptions = { noise: 10, vignette: 0.25, seed: 11 };
    const baseline = decodeEvidence(realisticEmptyRoom(room));
    const card = decodeEvidence(
      realisticHeld(
        scene(GREY, [...FURNITURE, { x: 80, y: 50, w: 80, h: 80, color: [128, 128, 130] }]),
        { ...room, seed: 12 },
      ),
    );

    for (const challenge of AUTO.filter((c) => c.detector.kind === 'color')) {
      const outcome = verifySubmission(challenge, baseline, card);
      expect(outcome.kind).toBe('verdict');
      if (outcome.kind !== 'verdict') continue;
      expect(outcome.verdict.matched, challenge.prompt).toBe(false);
    }
  });

  it('handles a camera that has been knocked slightly', () => {
    const room: SceneOptions = { noise: 9, vignette: 0.25, seed: 13 };
    const baseline = decodeEvidence(realisticEmptyRoom(room));
    // The furniture shifts a few pixels: a nudged laptop, not a new object.
    const nudged = decodeEvidence(
      realisticHeld(
        scene(GREY, FURNITURE.map((r) => ({ ...r, x: r.x + 4, y: r.y + 3 }))),
        { ...room, seed: 14 },
      ),
    );
    const red = AUTO.find((c) => c.detector.kind === 'color' && c.detector.target === 'red')!;
    const outcome = verifySubmission(red, baseline, nudged);
    expect(outcome.kind).toBe('verdict');
    if (outcome.kind !== 'verdict') return;
    expect(outcome.verdict.matched, outcome.verdict.reason).toBe(false);
  });
});
