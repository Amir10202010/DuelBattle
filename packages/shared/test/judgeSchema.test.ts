import { describe, expect, it } from 'vitest';
import {
  JUDGE_RESPONSE_JSON_SCHEMA,
  judgeResponseSchema,
  photoAssessmentSchema,
} from '../src/validation.js';

const assessmentJson = JUDGE_RESPONSE_JSON_SCHEMA.properties.assessments.items;

function sample(over: Record<string, unknown> = {}) {
  return {
    slot: 'A',
    valid: true,
    confidence: 0.9,
    fulfillment: 50,
    presentation: 20,
    objects: ['mug'],
    reason: 'A red mug held to the lens.',
    ...over,
  };
}

describe('the judge response contract', () => {
  it('describes the same fields in both halves', () => {
    // One half is what we ask the model for, the other is what we parse. They
    // are written separately so both are readable; this is what keeps them
    // saying the same thing.
    expect([...assessmentJson.required].sort()).toEqual(
      Object.entries(photoAssessmentSchema.shape).filter(([, schema]) => !schema.isOptional()).map(([key]) => key).sort(),
    );
    expect(Object.keys(assessmentJson.properties).sort()).toEqual(
      Object.keys(photoAssessmentSchema.shape).sort(),
    );
    expect([...JUDGE_RESPONSE_JSON_SCHEMA.required]).toEqual(
      Object.keys(judgeResponseSchema.shape),
    );
  });

  it('accepts a reply shaped the way the schema asks for', () => {
    const parsed = judgeResponseSchema.parse({ assessments: [sample(), sample({ slot: 'B' })] });
    expect(parsed.assessments).toHaveLength(2);
  });

  it('agrees on the bounds it advertises', () => {
    expect(assessmentJson.properties.fulfillment.maximum).toBe(70);
    expect(assessmentJson.properties.presentation.maximum).toBe(30);
    expect(() => photoAssessmentSchema.parse(sample({ fulfillment: 71 }))).toThrow();
    expect(() => photoAssessmentSchema.parse(sample({ presentation: 31 }))).toThrow();
    expect(() => photoAssessmentSchema.parse(sample({ confidence: 1.5 }))).toThrow();
  });

  it('refuses a reply that smuggles in an extra field', () => {
    // A model that starts returning `winner` must not be quietly obeyed.
    expect(assessmentJson.additionalProperties).toBe(false);
    expect(() => photoAssessmentSchema.parse(sample({ winner: 'A' }))).toThrow();
  });

  it('refuses more participants than a 1v1 has', () => {
    expect(JUDGE_RESPONSE_JSON_SCHEMA.properties.assessments.maxItems).toBe(2);
    expect(() =>
      judgeResponseSchema.parse({
        assessments: [sample(), sample({ slot: 'B' }), sample({ slot: 'A' })],
      }),
    ).toThrow();
  });
});
