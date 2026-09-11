import type { Challenge } from '../shared/challenges';
import { requireRule } from './errors';

export type VerificationDecision =
  | { kind: 'human-review'; reviewForMs: number }
  | { kind: 'verified'; reason: string }
  | { kind: 'rejected'; reason: string };
export interface VerificationProvider {
  readonly id: string;
  evaluate(input: { challenge: Challenge; image: string }): VerificationDecision;
}
export class OpponentVerificationProvider implements VerificationProvider {
  readonly id = 'opponent-review-v1';
  evaluate({ image }: { challenge: Challenge; image: string }): VerificationDecision {
    const bytes = Buffer.from(image.slice('data:image/jpeg;base64,'.length), 'base64');
    requireRule(
      bytes.length >= 100 &&
        bytes.length <= 82_500 &&
        bytes[0] === 0xff &&
        bytes[1] === 0xd8 &&
        bytes[2] === 0xff &&
        bytes.at(-2) === 0xff &&
        bytes.at(-1) === 0xd9,
      'BAD_EVIDENCE',
      'Take a fresh camera snapshot and try again.',
    );
    // A JPEG is evidence for the opponent, never proof of a model verdict or camera authenticity.
    return { kind: 'human-review', reviewForMs: 8_000 };
  }
}
