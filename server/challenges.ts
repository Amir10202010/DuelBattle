import { challengeSchema } from '../shared/validation';
import type { Challenge } from '../shared/challenges';

export interface ChallengeProposal {
  challenge: Challenge;
  status: 'PENDING_REVIEW';
}
export function validateProposal(
  input: unknown,
  supported: Challenge['verificationType'][],
): ChallengeProposal {
  const challenge = challengeSchema.parse(input);
  if (
    /[<>\n\r]|https?:|www\.|\b(knife|blade|fire|burn|weapon|gun|drug|alcohol|naked|nude|password|address|credit card|jump|climb|outside|swallow|choke|outlet|electric|suicide|kill|hate|blood)\b/i.test(
      challenge.prompt + ' ' + challenge.instructions,
    )
  ) {
    throw new Error('This challenge needs a safer idea.');
  }
  if (!supported.includes(challenge.verificationType))
    throw new Error('This verification method is unavailable.');
  if (challenge.subjective !== (challenge.verificationType === 'SUBJECTIVE'))
    throw new Error('Subjective challenges require human review.');
  if (challenge.aiVerifiable)
    throw new Error('Automatic verification is not available for custom challenges.');
  // Schema/rules cannot prove arbitrary text is safe or feasible: quarantine until human review.
  return { challenge, status: 'PENDING_REVIEW' };
}

export interface ChallengeGenerator {
  generate(context: {
    category: Challenge['category'];
    difficulty: Challenge['difficulty'];
    language: 'en';
    previousIds: string[];
    supported: Challenge['verificationType'][];
  }): Promise<unknown>;
}
export async function generateProposal(
  provider: ChallengeGenerator,
  context: Parameters<ChallengeGenerator['generate']>[0],
) {
  return validateProposal(await provider.generate(context), context.supported);
}
