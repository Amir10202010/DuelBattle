import { describe, expect, it } from 'vitest';
import { ANALYSIS_HEIGHT, ANALYSIS_WIDTH, getChallenge, type Challenge } from '@battle/shared';
import { DecodeError, decodeEvidence, verifySubmission } from '../src/verify.js';
import {
  BLUE,
  GREY,
  RED,
  emptyRoomFrame,
  failingFrameFor,
  heldObjectFrame,
  jpegDataUrl,
  passingFrameFor,
  scene,
} from './helpers.js';
import { CHALLENGES } from '@battle/shared';

const redChallenge = getChallenge('color-red') as Challenge;

describe('decodeEvidence', () => {
  it('decodes a webcam-sized JPEG down to the shared analysis size', () => {
    const frame = decodeEvidence(emptyRoomFrame());
    expect(frame.width).toBe(ANALYSIS_WIDTH);
    expect(frame.height).toBe(ANALYSIS_HEIGHT);
    expect(frame.data).toHaveLength(ANALYSIS_WIDTH * ANALYSIS_HEIGHT * 4);
  });

  it('rejects anything that is not a base64 JPEG data URL', () => {
    expect(() => decodeEvidence('https://example.com/cat.jpg')).toThrow(DecodeError);
    expect(() => decodeEvidence('data:image/png;base64,AAAA')).toThrow(DecodeError);
    expect(() => decodeEvidence('data:image/jpeg;base64,')).toThrow(DecodeError);
  });

  it('rejects bytes that are not actually a JPEG', () => {
    const junk = Buffer.from('this is definitely not a jpeg').toString('base64');
    expect(() => decodeEvidence(`data:image/jpeg;base64,${junk}`)).toThrow(DecodeError);
  });
});

describe('verifySubmission', () => {
  it('passes an object of the right colour held into frame', () => {
    const baseline = decodeEvidence(emptyRoomFrame());
    const submitted = decodeEvidence(heldObjectFrame(RED));
    const outcome = verifySubmission(redChallenge, baseline, submitted);
    expect(outcome.kind).toBe('verdict');
    if (outcome.kind !== 'verdict') return;
    expect(outcome.verdict.matched).toBe(true);
  });

  it('fails the same shot when the object is the wrong colour', () => {
    const baseline = decodeEvidence(emptyRoomFrame());
    const submitted = decodeEvidence(heldObjectFrame(BLUE));
    const outcome = verifySubmission(redChallenge, baseline, submitted);
    expect(outcome.kind).toBe('verdict');
    if (outcome.kind !== 'verdict') return;
    expect(outcome.verdict.matched).toBe(false);
  });

  it('does not accept a red object that was in the room the whole time', () => {
    // Baseline and submission are separate JPEG encodes of the same scene, so
    // this also proves compression noise alone cannot pass a round.
    const baseline = decodeEvidence(emptyRoomFrame(60));
    const submitted = decodeEvidence(emptyRoomFrame(75));
    const outcome = verifySubmission(redChallenge, baseline, submitted);
    expect(outcome.kind).toBe('verdict');
    if (outcome.kind !== 'verdict') return;
    expect(outcome.verdict.matched).toBe(false);
  });

  it('survives the quality gap between a live frame and a submitted snapshot', () => {
    // Live frames are small and heavily compressed; evidence is larger and
    // cleaner. The verdict must come from the scene, not the encoder.
    const baseline = decodeEvidence(jpegDataUrl(scene(GREY), 45));
    const submitted = decodeEvidence(jpegDataUrl(scene(GREY), 90));
    const outcome = verifySubmission(redChallenge, baseline, submitted);
    expect(outcome.kind).toBe('verdict');
    if (outcome.kind !== 'verdict') return;
    expect(outcome.verdict.matched).toBe(false);
    expect(outcome.verdict.reason).toMatch(/closer to the camera/);
  });

  it('asks for a baseline instead of guessing when it has none', () => {
    const submitted = decodeEvidence(heldObjectFrame(RED));
    expect(verifySubmission(redChallenge, undefined, submitted).kind).toBe('needs-baseline');
  });

  it('reports a peer challenge as undecidable rather than inventing a verdict', () => {
    const peerChallenge = getChallenge('story-older') as Challenge;
    const frame = decodeEvidence(emptyRoomFrame());
    expect(verifySubmission(peerChallenge, frame, frame).kind).toBe('undecidable');
  });
});


/**
 * The catalogue is the contract: anything marked `auto` claims a camera can
 * decide it. This walks every one of them through the real decode-and-verify
 * path, so a new challenge with thresholds nothing can actually reach fails
 * here rather than in a match.
 */
describe('every auto challenge in the catalogue', () => {
  const autoChallenges = CHALLENGES.filter((c) => c.judging === 'auto');

  it('has some to check', () => {
    expect(autoChallenges.length).toBeGreaterThanOrEqual(15);
  });

  for (const challenge of autoChallenges) {
    it(`accepts a good answer to "${challenge.prompt}"`, () => {
      const baseline = decodeEvidence(emptyRoomFrame());
      const submitted = decodeEvidence(passingFrameFor(challenge.detector!));
      const outcome = verifySubmission(challenge, baseline, submitted);
      expect(outcome.kind).toBe('verdict');
      if (outcome.kind !== 'verdict') return;
      expect(outcome.verdict.matched, outcome.verdict.reason).toBe(true);
      expect(outcome.verdict.confidence).toBeGreaterThan(0.4);
    });

    it(`rejects a bad answer to "${challenge.prompt}"`, () => {
      const baseline = decodeEvidence(emptyRoomFrame());
      const submitted = decodeEvidence(failingFrameFor(challenge.detector!));
      const outcome = verifySubmission(challenge, baseline, submitted);
      expect(outcome.kind).toBe('verdict');
      if (outcome.kind !== 'verdict') return;
      expect(outcome.verdict.matched, outcome.verdict.reason).toBe(false);
    });

    it(`rejects a still room for "${challenge.prompt}"`, () => {
      // Nothing moved: whatever was already in shot must never answer a round.
      const baseline = decodeEvidence(emptyRoomFrame(60));
      const submitted = decodeEvidence(emptyRoomFrame(78));
      const outcome = verifySubmission(challenge, baseline, submitted);
      expect(outcome.kind).toBe('verdict');
      if (outcome.kind !== 'verdict') return;
      expect(outcome.verdict.matched, outcome.verdict.reason).toBe(false);
    });
  }
});
