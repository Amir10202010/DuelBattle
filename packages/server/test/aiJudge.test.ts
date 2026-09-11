import { describe, expect, it } from 'vitest';
import type { Challenge } from '@battle/shared';
import { GeminiPhotoJudge, JudgeUnavailable, type JudgePhoto } from '../src/ai/judge.js';
import { GeminiKeyPool, quotaCooldown } from '../src/ai/keys.js';
import type { ObjectDetector } from '../src/ai/detector.js';

const CHALLENGE: Challenge = {
  id: 'obj-face',
  prompt: 'SHOW SOMETHING WITH A FACE',
  hint: 'A toy, a poster, a mug — not your own face.',
  category: 'object',
  difficulty: 2,
  durationMs: 28_000,
  judging: 'peer',
  tags: ['object', 'face'],
};

const PHOTO = 'data:image/jpeg;base64,AAAA';

function photos(): JudgePhoto[] {
  return [
    { playerId: 'ada-1', image: PHOTO, contextImages: [PHOTO] },
    { playerId: 'grace-2', image: PHOTO, contextImages: [] },
  ];
}

function assessment(slot: 'A' | 'B', over: Record<string, unknown> = {}) {
  return {
    slot,
    valid: true,
    confidence: 0.9,
    fulfillment: 50,
    presentation: 20,
    objects: ['mug'],
    reason: 'A mug with a painted face.',
    ...over,
  };
}

/** A reply shaped the way Gemini shapes one. */
function reply(assessments: unknown[], status = 200): Response {
  const body = {
    candidates: [
      {
        finishReason: 'STOP',
        content: { parts: [{ text: JSON.stringify({ assessments }) }] },
      },
    ],
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

interface Call {
  url: string;
  key: string;
  body: string;
}

/** Records what went up, and replays whatever the test queued. */
function recorder(responses: (() => Response)[]) {
  const calls: Call[] = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({
      url: String(url),
      key: headers.get('x-goog-api-key') ?? '',
      body: String(init?.body ?? ''),
    });
    const next = responses.shift();
    if (!next) throw new Error('the judge made more calls than the test queued');
    return next();
  }) as unknown as typeof fetch;
  return { calls, fetcher };
}

describe('the AI judge', () => {
  it('puts the names back on an anonymous verdict', async () => {
    const { fetcher } = recorder([() => reply([assessment('A'), assessment('B', { fulfillment: 20 })])]);
    const judge = new GeminiPhotoJudge({ apiKeys: 'k1', fetcher });

    const result = await judge.judge({
      challenge: CHALLENGE,
      photos: photos(),
      signal: AbortSignal.timeout(5_000),
    });

    expect(result).toHaveLength(2);
    expect(new Set(result.map((r) => r.playerId))).toEqual(new Set(['ada-1', 'grace-2']));
    // 50 + 20 and 20 + 20: fulfilment and presentation added, not averaged.
    expect(new Set(result.map((r) => r.score))).toEqual(new Set([70, 40]));
  });

  it('never tells the model who it is judging', async () => {
    // Names, ids, scores and arrival times are all things a referee could be
    // unfair with, so none of them go up.
    const { calls, fetcher } = recorder([() => reply([assessment('A'), assessment('B')])]);
    const judge = new GeminiPhotoJudge({ apiKeys: 'k1', fetcher });

    await judge.judge({
      challenge: CHALLENGE,
      photos: photos(),
      signal: AbortSignal.timeout(5_000),
    });

    const body = calls[0]!.body;
    expect(body).not.toContain('ada-1');
    expect(body).not.toContain('grace-2');
    expect(body).toContain('SHOW SOMETHING WITH A FACE');
  });

  it('scores a reading the model is unsure of at zero', async () => {
    const { fetcher } = recorder([
      () => reply([assessment('A', { confidence: 0.4 }), assessment('B')]),
    ]);
    const judge = new GeminiPhotoJudge({ apiKeys: 'k1', fetcher });

    const result = await judge.judge({
      challenge: CHALLENGE,
      photos: photos(),
      signal: AbortSignal.timeout(5_000),
    });

    const unsure = result.find((r) => r.confidence === 0.4);
    expect(unsure?.score).toBe(0);
  });

  it('scores an answer the model called invalid at zero, however high it marked it', async () => {
    const { fetcher } = recorder([
      () => reply([assessment('A', { valid: false, fulfillment: 70, presentation: 30 }), assessment('B')]),
    ]);
    const judge = new GeminiPhotoJudge({ apiKeys: 'k1', fetcher });

    const result = await judge.judge({
      challenge: CHALLENGE,
      photos: photos(),
      signal: AbortSignal.timeout(5_000),
    });

    expect(result.find((r) => !r.valid)?.score).toBe(0);
  });

  it('moves to the next key when one is out of quota', async () => {
    const { calls, fetcher } = recorder([
      () => new Response('{}', { status: 429, headers: { 'retry-after': '30' } }),
      () => reply([assessment('A'), assessment('B')]),
    ]);
    const judge = new GeminiPhotoJudge({ apiKeys: ['k1', 'k2'], fetcher });

    await judge.judge({
      challenge: CHALLENGE,
      photos: photos(),
      signal: AbortSignal.timeout(5_000),
    });

    expect(calls.map((c) => c.key)).toEqual(['k1', 'k2']);
  });

  it('stops using a key the provider rejects outright', async () => {
    const { calls, fetcher } = recorder([
      () => new Response('{}', { status: 403 }),
      () => reply([assessment('A'), assessment('B')]),
    ]);
    const judge = new GeminiPhotoJudge({ apiKeys: ['k1', 'k2'], fetcher });

    await judge.judge({
      challenge: CHALLENGE,
      photos: photos(),
      signal: AbortSignal.timeout(5_000),
    });
    expect(calls.map((c) => c.key)).toEqual(['k1', 'k2']);
  });

  it('leaves a rejected key out of the rotation for good', () => {
    // A key the provider refuses is not going to start working in a minute.
    const pool = new GeminiKeyPool(['k1', 'k2']);
    pool.disable('k1');
    expect(pool.take(new Set())).toBe('k2');
    expect(pool.take(new Set())).toBe('k2');
  });

  it('hands the round back rather than inventing a verdict when no key works', async () => {
    const { fetcher } = recorder([
      () => new Response('{}', { status: 429 }),
      () => new Response('{}', { status: 429 }),
    ]);
    const judge = new GeminiPhotoJudge({ apiKeys: ['k1', 'k2'], fetcher });

    await expect(
      judge.judge({ challenge: CHALLENGE, photos: photos(), signal: AbortSignal.timeout(5_000) }),
    ).rejects.toBeInstanceOf(JudgeUnavailable);
  });

  it('refuses a reply that drops a participant', async () => {
    const { fetcher } = recorder([() => reply([assessment('A')])]);
    const judge = new GeminiPhotoJudge({ apiKeys: 'k1', fetcher });

    await expect(
      judge.judge({ challenge: CHALLENGE, photos: photos(), signal: AbortSignal.timeout(5_000) }),
    ).rejects.toThrow(/omitted or duplicated/i);
  });

  it('refuses a reply that answers for the same slot twice', async () => {
    const { fetcher } = recorder([() => reply([assessment('A'), assessment('A')])]);
    const judge = new GeminiPhotoJudge({ apiKeys: 'k1', fetcher });

    await expect(
      judge.judge({ challenge: CHALLENGE, photos: photos(), signal: AbortSignal.timeout(5_000) }),
    ).rejects.toThrow(/omitted or duplicated/i);
  });

  it('refuses a reply with a field nobody asked for', async () => {
    const { fetcher } = recorder([
      () => reply([assessment('A', { winner: 'A' }), assessment('B')]),
    ]);
    const judge = new GeminiPhotoJudge({ apiKeys: 'k1', fetcher });

    await expect(
      judge.judge({ challenge: CHALLENGE, photos: photos(), signal: AbortSignal.timeout(5_000) }),
    ).rejects.toThrow();
  });

  it('judges anyway when the local detector is unreachable', async () => {
    const broken: ObjectDetector = {
      detect: () => Promise.reject(new Error('YOLO detector unavailable')),
    };
    const { fetcher } = recorder([() => reply([assessment('A'), assessment('B')])]);
    const judge = new GeminiPhotoJudge({ apiKeys: 'k1', fetcher, detector: broken });

    const result = await judge.judge({
      challenge: CHALLENGE,
      photos: photos(),
      signal: AbortSignal.timeout(5_000),
    });

    // A hint that did not arrive must not cost anybody the round; it is only
    // reported as missing.
    expect(result.every((r) => r.detector === 'unavailable')).toBe(true);
    expect(result.every((r) => r.detections?.length === 0)).toBe(true);
  });

  it('passes local detections through when they are available', async () => {
    const detector: ObjectDetector = {
      detect: (images) =>
        Promise.resolve(images.map(() => [{ label: 'cup', confidence: 0.8, box: [0, 0, 1, 1] as [number, number, number, number] }])),
    };
    const { calls, fetcher } = recorder([() => reply([assessment('A'), assessment('B')])]);
    const judge = new GeminiPhotoJudge({ apiKeys: 'k1', fetcher, detector });

    const result = await judge.judge({
      challenge: CHALLENGE,
      photos: photos(),
      signal: AbortSignal.timeout(5_000),
    });

    expect(result.every((r) => r.detector === 'yolov8')).toBe(true);
    expect(calls[0]!.body).toContain('cup');
  });

  it('turns away a round it has no capacity for instead of queueing it', async () => {
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetcher = (async () => {
      await held;
      return reply([assessment('A'), assessment('B')]);
    }) as unknown as typeof fetch;
    const judge = new GeminiPhotoJudge({ apiKeys: 'k1', fetcher, maxConcurrent: 1 });

    const first = judge.judge({
      challenge: CHALLENGE,
      photos: photos(),
      signal: AbortSignal.timeout(5_000),
    });
    await expect(
      judge.judge({ challenge: CHALLENGE, photos: photos(), signal: AbortSignal.timeout(5_000) }),
    ).rejects.toBeInstanceOf(JudgeUnavailable);

    release();
    await first;
  });

  it('refuses a model name that could reshape the request URL', () => {
    expect(() => new GeminiPhotoJudge({ apiKeys: 'k1', model: '../../evil' })).toThrow();
  });
});

describe('the key pool', () => {
  it('needs at least one key', () => {
    expect(() => new GeminiKeyPool('')).toThrow(/GEMINI_API_KEYS/);
  });

  it('takes keys in turn so one does not carry the room', () => {
    const pool = new GeminiKeyPool(['a', 'b', 'c']);
    expect([pool.take(new Set()), pool.take(new Set()), pool.take(new Set())]).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('drops duplicates and blank entries from the configured list', () => {
    const pool = new GeminiKeyPool(' a , a ,, b ');
    expect([pool.take(new Set()), pool.take(new Set()), pool.take(new Set())]).toEqual([
      'a',
      'b',
      'a',
    ]);
  });

  it('skips a key that is resting, and returns to it once it is not', () => {
    let now = 1_000;
    const pool = new GeminiKeyPool(['a', 'b'], () => now);
    pool.cooldown('a', 5_000);
    expect(pool.take(new Set())).toBe('b');
    now += 5_001;
    expect(pool.take(new Set())).toBe('a');
  });

  it('has nothing left to offer once every key is resting', () => {
    const pool = new GeminiKeyPool(['a'], () => 0);
    pool.cooldown('a', 1_000);
    expect(pool.take(new Set())).toBeNull();
  });

  it('skips keys this request has already tried', () => {
    const pool = new GeminiKeyPool(['a', 'b']);
    expect(pool.take(new Set(['a']))).toBe('b');
  });
});

describe('quota cooldown', () => {
  it('rests a key for a minute by default', async () => {
    expect(await quotaCooldown(new Response('{}', { status: 429 }))).toBe(60_000);
  });

  it('honours a longer Retry-After', async () => {
    const response = new Response('{}', { status: 429, headers: { 'retry-after': '300' } });
    expect(await quotaCooldown(response)).toBe(300_000);
  });

  it('rests a key for the day when the daily quota is gone', async () => {
    // A minute's rest on an exhausted daily quota just burns the next round too.
    const body = JSON.stringify({
      error: { details: [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProject' }] }] },
    });
    const response = new Response(body, {
      status: 429,
      headers: { 'content-type': 'application/json' },
    });
    expect(await quotaCooldown(response)).toBe(86_400_000);
  });

  it('never rests a key longer than a day', async () => {
    const response = new Response('{}', { status: 429, headers: { 'retry-after': '999999999' } });
    expect(await quotaCooldown(response)).toBe(86_400_000);
  });
});
