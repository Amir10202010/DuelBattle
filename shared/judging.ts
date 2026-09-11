import { z } from 'zod';

export const photoAssessmentSchema = z
  .object({
    slot: z.enum(['A', 'B']),
    valid: z.boolean(),
    confidence: z.number().min(0).max(1),
    fulfillment: z.number().int().min(0).max(70),
    presentation: z.number().int().min(0).max(30),
    objects: z.array(z.string().min(1).max(60)).max(8),
    reason: z.string().min(1).max(300),
  })
  .strict();

export const judgeResponseSchema = z
  .object({
    assessments: z.array(photoAssessmentSchema).min(1).max(2),
  })
  .strict();

export type PhotoAssessment = z.infer<typeof photoAssessmentSchema>;
export const detectionSchema = z
  .object({
    label: z.string().min(1).max(60),
    confidence: z.number().min(0).max(1),
    box: z.tuple([
      z.number().min(0).max(1),
      z.number().min(0).max(1),
      z.number().min(0).max(1),
      z.number().min(0).max(1),
    ]),
  })
  .strict();
export type Detection = z.infer<typeof detectionSchema>;
export interface PlayerAssessment extends Omit<PhotoAssessment, 'slot'> {
  detector?: 'yolov8' | 'unavailable';
  detections?: Detection[];
  playerId: string;
  score: number;
}
export interface Judgement {
  assessments: PlayerAssessment[];
  winnerId: string | null;
  reason: string;
}

/** The model assesses the photos; only server rules award a point. */
export function decidePhotos(assessments: PlayerAssessment[]): Judgement {
  const eligible = assessments.filter((a) => a.valid && a.confidence >= 0.7);
  const ranked = [...eligible].sort((a, b) => b.score - a.score);
  if (!ranked.length)
    return {
      assessments,
      winnerId: null,
      reason: 'AI could not confirm a valid answer. No points this round.',
    };
  if (ranked.length === 2 && ranked[0].score - ranked[1].score <= 3)
    return {
      assessments,
      winnerId: null,
      reason: 'AI scores are within 3 points. This round is a draw.',
    };
  const winner = ranked[0];
  return {
    assessments,
    winnerId: winner.playerId,
    reason: `AI judge: ${winner.score}/100. ${winner.reason}`,
  };
}
