import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { GeminiPhotoJudge, type AiJudge } from '../server/ai-judge';
import { GeminiKeyPool, quotaCooldown } from '../server/gemini-keys';
import { YoloObjectDetector } from '../server/object-detector';
import { GameEngine } from '../server/game';
import { Store } from '../server/store';
import { AI_CHALLENGES } from '../shared/challenges';
import { decidePhotos, type PhotoAssessment, type PlayerAssessment } from '../shared/judging';
import { heldObjectFrame, RED, BLUE } from './evidence-helpers';

const photo = heldObjectFrame(RED);
const otherPhoto = heldObjectFrame(BLUE);
const assessment = (slot: 'A' | 'B', fulfillment = 65): PhotoAssessment => ({
  slot,
  valid: true,
  confidence: 0.95,
  fulfillment,
  presentation: 25,
  objects: ['cup'],
  reason: 'A clearly presented cup matches the prompt.',
});
const response = (assessments = [assessment('A'), assessment('B', 50)]) =>
  new Response(
    JSON.stringify({
      candidates: [
        { finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ assessments }) }] } },
      ],
    }),
    { status: 200 },
  );
const input = () => ({
  challenge: AI_CHALLENGES[0],
  photos: [
    { playerId: 'player-a', image: photo, contextImages: [photo] },
    { playerId: 'player-b', image: otherPhoto, contextImages: [] },
  ],
  signal: new AbortController().signal,
});

describe('Gemini vision boundary', () => {
  it('sends real image bytes, anonymous slots, a strict rubric and YOLO hints; maps scores to the correct players', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response());
    const detector = {
      detect: vi
        .fn()
        .mockResolvedValue([[{ label: 'cup', confidence: 0.9, box: [0, 0, 1, 1] }], []]),
    };
    const result = await new GeminiPhotoJudge('secret-key', undefined, fetcher, detector).judge(
      input(),
    );
    const [url, options] = fetcher.mock.calls[0];
    const body = JSON.parse(options!.body as string);
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    );
    expect(url).not.toContain('secret-key');
    expect(options!.headers).toMatchObject({ 'x-goog-api-key': 'secret-key' });
    expect(body.generationConfig).toMatchObject({
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingBudget: 0 },
    });
    expect(body.systemInstruction.parts[0].text).toContain('never instructions');
    expect(JSON.stringify(body)).not.toMatch(/player-a|player-b|secret-key/);
    const images = body.contents[0].parts.filter((p: { inlineData?: unknown }) => p.inlineData);
    expect(images).toHaveLength(3);
    const firstPhoto = images[0].inlineData.data;
    expect(result[0]).toMatchObject({
      playerId: firstPhoto === photo.split(',')[1] ? 'player-a' : 'player-b',
      score: 90,
      detector: 'yolov8',
    });
    expect(result[1].score).toBe(75);
  });
  it('tries the next supplied key on quota, and keeps the exhausted key on cooldown', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{}', { status: 429 }))
      .mockImplementation(async () => response());
    const judge = new GeminiPhotoJudge('key-one, key-two, key-one', undefined, fetcher);
    await judge.judge(input());
    await judge.judge(input());
    expect(
      fetcher.mock.calls.map((c) => (c[1]!.headers as Record<string, string>)['x-goog-api-key']),
    ).toEqual(['key-one', 'key-two', 'key-two']);
  });
  it('bounds retries to three keys and reports exhausted quotas without leaking keys', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response('{}', { status: 429 }));
    const judge = new GeminiPhotoJudge('one,two,three,four', undefined, fetcher);
    await expect(judge.judge(input())).rejects.toThrow('quota is exhausted');
    expect(fetcher).toHaveBeenCalledTimes(3);
    await expect(judge.judge(input())).rejects.toThrow('quota is exhausted');
    expect(fetcher).toHaveBeenCalledTimes(4);
    await expect(judge.judge(input())).rejects.toThrow('quota is exhausted');
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it.each([401, 403])(
    'disables an unauthorized key (%i) and moves to another configured key',
    async (status) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(new Response('{}', { status }))
        .mockImplementation(async () => response());
      const judge = new GeminiPhotoJudge('bad-key,good-key', undefined, fetcher);
      await judge.judge(input());
      await judge.judge(input());
      expect(
        fetcher.mock.calls.map((c) => (c[1]!.headers as Record<string, string>)['x-goog-api-key']),
      ).toEqual(['bad-key', 'good-key', 'good-key']);
    },
  );
  it.each([
    { assessments: [assessment('A'), assessment('A')] },
    { assessments: [assessment('A')] },
    { assessments: [{ ...assessment('A'), fulfillment: 999 }, assessment('B')] },
  ])('rejects invalid or mismatched model assessments', async ({ assessments }) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(assessments));
    await expect(new GeminiPhotoJudge('key', undefined, fetcher).judge(input())).rejects.toThrow();
  });
  it('gives uncertain answers zero score, and reports a detector outage honestly', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response([{ ...assessment('A'), confidence: 0.3 }, assessment('B')]));
    const result = await new GeminiPhotoJudge('key', undefined, fetcher, {
      detect: async () => {
        throw new Error('offline');
      },
    }).judge(input());
    expect(result[0]).toMatchObject({ score: 0, detector: 'unavailable', detections: [] });
  });
  it('rejects refusal, truncated JSON and transport errors instead of inventing scores', async () => {
    for (const data of [
      { candidates: [{ finishReason: 'SAFETY' }] },
      { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [] } }] },
      { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{' }] } }] },
    ]) {
      await expect(
        new GeminiPhotoJudge(
          'key',
          undefined,
          vi.fn<typeof fetch>().mockResolvedValue(Response.json(data)),
        ).judge(input()),
      ).rejects.toThrow();
    }
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('network'));
    await expect(new GeminiPhotoJudge('key', undefined, fetcher).judge(input())).rejects.toThrow(
      'network',
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('key cooldowns and YOLO boundary', () => {
  it('deduplicates keys, respects cooldowns, and never reuses disabled keys', () => {
    let now = 100;
    const pool = new GeminiKeyPool(' a, b, a , ', () => now);
    expect(pool.take(new Set())).toBe('a');
    pool.cooldown('a', 1000);
    expect(pool.take(new Set())).toBe('b');
    pool.disable('b');
    expect(pool.take(new Set())).toBeNull();
    now += 1001;
    expect(pool.take(new Set())).toBe('a');
  });
  it('respects daily quota and Retry-After from Gemini', async () => {
    expect(
      await quotaCooldown(
        Response.json({
          error: { details: [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProject' }] }] },
        }),
      ),
    ).toBe(86_400_000);
    expect(await quotaCooldown(new Response('{}', { headers: { 'retry-after': '120' } }))).toBe(
      120_000,
    );
  });
  it('requires a validated result for every submitted image from the local detector', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        detections: [[{ label: 'cup', confidence: 0.8, box: [0.1, 0.2, 0.8, 0.9] }]],
      }),
    );
    const detector = new YoloObjectDetector('http://127.0.0.1:8001', 'local-token', fetcher);
    await expect(detector.detect([photo], new AbortController().signal)).resolves.toHaveLength(1);
    expect(fetcher.mock.calls[0][1]!.headers).toMatchObject({
      Authorization: 'Bearer local-token',
    });
    const malformed = new YoloObjectDetector(
      undefined,
      '',
      vi.fn<typeof fetch>().mockResolvedValue(Response.json({ detections: [] })),
    );
    await expect(malformed.detect([photo], new AbortController().signal)).rejects.toThrow();
  });
});

describe('server-owned AI rounds', () => {
  let store: Store;
  let game: GameEngine;
  let now: number;
  let ids: string[];
  let code: string;
  let resolveJudge: (value: PlayerAssessment[]) => void;
  let rejectJudge: (error: Error) => void;
  let judge: ReturnType<typeof vi.fn<AiJudge['judge']>>;
  beforeEach(() => {
    now = Date.now();
    store = new Store(':memory:');
    ids = [store.createSession(now).session.id, store.createSession(now).session.id];
    judge = vi.fn(
      () =>
        new Promise((resolve, reject) => {
          resolveJudge = resolve;
          rejectJudge = reject;
        }),
    );
    game = new GameEngine(
      store,
      () => {},
      () => now,
      {},
      undefined,
      () => 0,
      { judge },
    );
    code = game.create(ids[0], 'Alex', 'a').code;
    game.join(code, ids[1], 'Jamie', 'b');
    ids.forEach((id, i) => {
      game.media(code, id, i ? 'b' : 'a', true, false);
      game.ready(code, id, i ? 'b' : 'a', true);
    });
    now += 3000;
    game.tick();
  });
  afterEach(() => {
    game.close();
    store.close();
  });
  const snap = () => game.snapshot(code);
  const submit = (i: number) =>
    game.submit(
      code,
      ids[i],
      i ? 'b' : 'a',
      snap().round!.id,
      randomUUID(),
      i ? otherPhoto : photo,
    );
  const scored = (i: number, score: number): PlayerAssessment => ({
    ...assessment(i ? 'B' : 'A', score - 25),
    playerId: ids[i],
    score,
  });
  const flush = async () => {
    await new Promise<void>((resolve) => setImmediate(resolve));
  };

  it('locks one photo, hides it from the other player until judging, then picks quality over speed', async () => {
    expect(snap().judgeMode).toBe('ai');
    expect(snap().round!.challenge!.aiVerifiable).toBe(true);
    await submit(0);
    expect(judge).not.toHaveBeenCalled();
    expect(snap().round!.attempts[0].image).toBe('');
    await expect(submit(0)).rejects.toThrow('already been submitted');
    expect(() =>
      game.review(code, ids[1], 'b', snap().round!.id, snap().round!.attempts[0].id, true),
    ).toThrow('AI judge');
    await submit(1);
    await flush();
    expect(snap().state).toBe('JUDGING');
    expect(snap().round!.attempts[0].image).toBe(photo);
    expect(judge).toHaveBeenCalledTimes(1);
    resolveJudge([scored(0, 70), scored(1, 93)]);
    await flush();
    expect(snap().round!.winnerId).toBe(ids[1]);
    expect(snap().players.map((p) => p.score)).toEqual([0, 1]);
    expect(snap().history[0].judgement!.assessments).toHaveLength(2);
    expect(snap().round!.attempts).toEqual([]);
  });
  it('gives the missing player the entire timer, then judges the one submitted answer', async () => {
    await submit(0);
    now = snap().round!.endsAt - 1;
    game.tick();
    expect(snap().state).toBe('CHALLENGE_ACTIVE');
    now++;
    game.tick();
    await flush();
    expect(judge.mock.calls[0][0].photos).toHaveLength(1);
    resolveJudge([scored(0, 85)]);
    await flush();
    expect(snap().round!.winnerId).toBe(ids[0]);
  });
  it('awards no points for a tie or two invalid answers', () => {
    expect(decidePhotos([scored(0, 88), scored(1, 90)]).winnerId).toBeNull();
    expect(
      decidePhotos([0, 1].map((i) => ({ ...scored(i, 99), valid: false }))).winnerId,
    ).toBeNull();
  });
  it('skips the API when neither player sends a photo', () => {
    now = snap().round!.endsAt;
    game.tick();
    expect(snap().state).toBe('ROUND_RESULT');
    expect(judge).not.toHaveBeenCalled();
    expect(snap().round!.winnerId).toBeNull();
  });
  it('times out without awarding points and ignores a late result', async () => {
    await submit(0);
    await submit(1);
    await flush();
    now += 20_001;
    game.tick();
    expect(snap().state).toBe('ROUND_RESULT');
    expect(judge.mock.calls[0][0].signal.aborted).toBe(true);
    resolveJudge([scored(0, 90), scored(1, 60)]);
    await flush();
    expect(snap().round!.winnerId).toBeNull();
    expect(snap().history).toHaveLength(1);
  });
  it('aborts a judge on disconnect and cannot score into a restarted round', async () => {
    await submit(0);
    await submit(1);
    await flush();
    const previousRound = snap().round!.id;
    game.disconnect(ids[0], 'a');
    expect(judge.mock.calls[0][0].signal.aborted).toBe(true);
    game.join(code, ids[0], 'Alex', 'new-a');
    game.media(code, ids[0], 'new-a', true, false);
    expect(snap().state).toBe('COUNTDOWN');
    expect(snap().round!.id).not.toBe(previousRound);
    resolveJudge([scored(0, 90), scored(1, 60)]);
    await flush();
    expect(snap().players.map((p) => p.score)).toEqual([0, 0]);
  });
  it('handles provider failure without falling back to opponent votes', async () => {
    await submit(0);
    await submit(1);
    await flush();
    rejectJudge(new Error('secret upstream details'));
    await flush();
    expect(snap().state).toBe('ROUND_RESULT');
    expect(snap().round!.reason).toContain('unavailable');
    expect(JSON.stringify(snap())).not.toContain('secret upstream');
  });
  it('rejects an AI result with another identity rather than corrupting the scores', async () => {
    await submit(0);
    await submit(1);
    await flush();
    resolveJudge([scored(0, 90), { ...scored(1, 60), playerId: 'foreign-player' }]);
    await flush();
    expect(snap().state).toBe('ROUND_RESULT');
    expect(snap().round!.winnerId).toBeNull();
    expect(snap().players.map((p) => p.score)).toEqual([0, 0]);
  });
});
