/**
 * What an AI referee is allowed to say about a round, and what the server does
 * with it.
 *
 * The model assesses photographs. It never picks the winner and never awards a
 * point: it returns a per-player reading, and `decidePhotos` — a pure function
 * on this side of the wire — turns those readings into an outcome. That split
 * is the whole reason an AI can be trusted with a round at all. A model that
 * could hand out points would be a client with an API key.
 */

/** Below this, the model is saying "I think so", which is not good enough to score. */
export const AI_CONFIDENCE_FLOOR = 0.7;

/**
 * Two answers this close are a draw rather than a win.
 *
 * Scores out of 100 carry an honest margin of error, and a round decided by one
 * point of "presentation" would be a coin toss wearing a number.
 */
export const AI_DRAW_MARGIN = 3;

/** One object the local detector believes it saw, with a normalised box. */
export interface Detection {
  label: string;
  confidence: number;
  /** [x0, y0, x1, y1], each 0..1 of the frame. */
  box: [number, number, number, number];
}

/**
 * The model's reading of one photo.
 *
 * `slot` is A or B and deliberately carries no identity: the judge is handed
 * anonymous, shuffled slots so nothing about who submitted, in what order, or
 * with what score can reach it.
 */
export interface PhotoAssessment {
  slot: 'A' | 'B';
  valid: boolean;
  confidence: number;
  /** 0..70 — how completely the visible answer fits the prompt. */
  fulfillment: number;
  /** 0..30 — how clearly, and for creative prompts how inventively, it is presented. */
  presentation: number;
  objects: string[];
  reason: string;
}

/** An assessment once the server has put a name back on it. */
export interface PlayerAssessment extends Omit<PhotoAssessment, 'slot'> {
  playerId: string;
  /** 0..100, or 0 when the reading does not clear the confidence floor. */
  score: number;
  detector?: 'yolov8' | 'unavailable';
  detections?: Detection[];
}

export interface Judgement {
  assessments: PlayerAssessment[];
  winnerId: string | null;
  reason: string;
}

/**
 * Turns per-photo readings into a round outcome.
 *
 * Pure, and deliberately kept away from the network code: the rule that decides
 * a round should be readable in one screen and testable without a model.
 */
export function decidePhotos(assessments: readonly PlayerAssessment[]): Judgement {
  const all = [...assessments];
  const eligible = all.filter((a) => a.valid && a.confidence >= AI_CONFIDENCE_FLOOR);
  const ranked = [...eligible].sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (!best) {
    return {
      assessments: all,
      winnerId: null,
      reason: 'The AI could not confirm a valid answer. No points this round.',
    };
  }

  const runnerUp = ranked[1];
  if (runnerUp && best.score - runnerUp.score <= AI_DRAW_MARGIN) {
    return {
      assessments: all,
      winnerId: null,
      reason: `Too close to call — within ${AI_DRAW_MARGIN} points. The round is a draw.`,
    };
  }

  return {
    assessments: all,
    winnerId: best.playerId,
    reason: `AI judge: ${best.score}/100. ${best.reason}`,
  };
}
