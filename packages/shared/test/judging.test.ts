import { describe, expect, it } from 'vitest';
import {
  AI_CONFIDENCE_FLOOR,
  AI_DRAW_MARGIN,
  decidePhotos,
  type PlayerAssessment,
} from '../src/judging.js';

function reading(over: Partial<PlayerAssessment> & { playerId: string }): PlayerAssessment {
  return {
    valid: true,
    confidence: 0.9,
    fulfillment: 50,
    presentation: 20,
    objects: ['mug'],
    reason: 'A red mug held to the lens.',
    score: 70,
    ...over,
  };
}

describe('decidePhotos', () => {
  it('gives the round to the clearly better answer', () => {
    const result = decidePhotos([
      reading({ playerId: 'p1', score: 80 }),
      reading({ playerId: 'p2', score: 40 }),
    ]);
    expect(result.winnerId).toBe('p1');
    expect(result.reason).toContain('80/100');
  });

  it('calls a draw when the two are within the margin', () => {
    // Scores out of 100 carry a margin of error; a round decided by one point
    // of "presentation" is a coin toss wearing a number.
    const result = decidePhotos([
      reading({ playerId: 'p1', score: 60 }),
      reading({ playerId: 'p2', score: 60 - AI_DRAW_MARGIN }),
    ]);
    expect(result.winnerId).toBeNull();
    expect(result.reason).toMatch(/draw/i);
  });

  it('gives it to the better answer one point past the margin', () => {
    const result = decidePhotos([
      reading({ playerId: 'p1', score: 60 }),
      reading({ playerId: 'p2', score: 60 - AI_DRAW_MARGIN - 1 }),
    ]);
    expect(result.winnerId).toBe('p1');
  });

  it('ignores a reading the model is not confident about', () => {
    // "I think so" is not good enough to take a round off somebody.
    const result = decidePhotos([
      reading({ playerId: 'p1', score: 95, confidence: AI_CONFIDENCE_FLOOR - 0.01 }),
      reading({ playerId: 'p2', score: 40 }),
    ]);
    expect(result.winnerId).toBe('p2');
  });

  it('ignores a high score the model marked invalid', () => {
    const result = decidePhotos([
      reading({ playerId: 'p1', score: 95, valid: false }),
      reading({ playerId: 'p2', score: 30 }),
    ]);
    expect(result.winnerId).toBe('p2');
  });

  it('scores nobody when neither answer can be confirmed', () => {
    const result = decidePhotos([
      reading({ playerId: 'p1', valid: false }),
      reading({ playerId: 'p2', confidence: 0.2 }),
    ]);
    expect(result.winnerId).toBeNull();
    expect(result.reason).toMatch(/could not confirm/i);
  });

  it('lets a lone valid answer take the round', () => {
    const result = decidePhotos([reading({ playerId: 'p1', score: 55 })]);
    expect(result.winnerId).toBe('p1');
  });

  it('hands back every reading, including the ones that did not count', () => {
    // The losing player is owed the explanation as much as the winner is.
    const result = decidePhotos([
      reading({ playerId: 'p1', score: 80 }),
      reading({ playerId: 'p2', valid: false, reason: 'Nothing red is visible.' }),
    ]);
    expect(result.assessments).toHaveLength(2);
    expect(result.assessments.find((a) => a.playerId === 'p2')?.reason).toBe(
      'Nothing red is visible.',
    );
  });

  it('does not mutate what it was given', () => {
    const given = [reading({ playerId: 'p1', score: 10 }), reading({ playerId: 'p2', score: 90 })];
    decidePhotos(given);
    expect(given.map((a) => a.playerId)).toEqual(['p1', 'p2']);
  });
});
