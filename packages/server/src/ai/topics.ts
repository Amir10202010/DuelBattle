import { z } from 'zod';
import {
  MAX_TOPIC_LENGTH,
  MIN_TOPIC_LENGTH,
  validateTopic,
  type TopicCandidate,
  type TopicRejection,
} from '@battle/shared';
import { GeminiKeyPool, quotaCooldown } from './keys.js';

/**
 * Where the topic pool comes from.
 *
 * The shape is Gemini → curation → validation → pool → game, and the arrow
 * that matters is the last one: the game reads a file, never this. A thousand
 * prompts are generated once, by an operator running a command, and shipped in
 * the repository. Nothing in a match, a lobby or a page load reaches a model
 * for a prompt — that would be a network round trip and an API bill in the
 * middle of a race that is decided in three seconds.
 *
 * Everything a model returns is treated as a proposal. The validator refuses
 * anything too long to render, anything that is not an instruction, anything
 * that asks a player to hold up a bank card or fetch a person, and anything the
 * game already asks. What survives goes in the file; what does not is counted
 * and reported, because a generator whose rejection rate nobody looks at is a
 * generator quietly getting worse.
 */

/** What a run is asked for, per category. */
export interface TopicRequest {
  category: string;
  /** Written for the model: what this category is and what it is not. */
  brief: string;
  /** Whether prompts here should be settleable from a photograph. */
  visual: boolean;
  count: number;
}

export interface GenerationReport {
  requested: number;
  accepted: TopicCandidate[];
  /** Why candidates were refused, counted by reason. */
  rejected: Record<TopicRejection, number>;
  /** Categories the model could not be reached for. */
  unavailable: string[];
}

const responseSchema = z.object({
  prompts: z
    .array(
      z.object({
        prompt: z.string().min(1).max(200),
        difficulty: z.number().int().min(1).max(3).optional(),
      }),
    )
    .max(120),
});

const RESPONSE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    prompts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          prompt: { type: 'string' },
          difficulty: { type: 'integer' },
        },
        required: ['prompt', 'difficulty'],
      },
    },
  },
  required: ['prompts'],
} as const;

const envelopeSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z.object({
          parts: z.array(z.object({ text: z.string().optional(), thought: z.boolean().optional() })),
        }),
      }),
    )
    .min(1),
});

/**
 * What the model is told before it is asked for anything.
 *
 * Most of this is here because of a specific way a prompt generator goes
 * wrong. It is told the answer has to be in an ordinary room because otherwise
 * half of them need a garden; told that the round lasts thirty seconds because
 * otherwise they need a trip upstairs; told that a person watching a
 * photograph has to be able to rule on it, because that is who judges; and told
 * not to ask for documents, other people or anything on fire, because those are
 * the three it reaches for unprompted.
 */
function instructions(request: TopicRequest): string {
  return [
    'You write prompts for a two-player webcam game.',
    'Both players get the same prompt at the same second and race to hold up an answer.',
    'A round lasts about thirty seconds, so the answer must be within arm’s reach of a desk.',
    'Every prompt must be an instruction in the imperative, in English, in UPPER CASE.',
    `Every prompt must be at most ${MAX_TOPIC_LENGTH} characters and at least ${MIN_TOPIC_LENGTH}.`,
    'Start with a verb: SHOW, FIND, HOLD UP, GRAB, BRING, PUT, WEAR, PROVE, BUILD, MAKE.',
    'Use only letters, digits, spaces and ordinary punctuation.',
    request.visual
      ? 'Each prompt must be settleable from a single photograph by somebody who cannot ask questions.'
      : 'Each prompt may rely on what the player says about the object; a photograph alone need not settle it.',
    'Never ask for identity documents, bank cards, addresses, passwords or anything with personal data on it.',
    'Never ask for another person, a child or an animal to appear on camera.',
    'Never ask anyone to light a fire, handle a weapon, climb, lean out of a window or show medication.',
    'Never ask for nudity or for a player to remove clothing.',
    'Prompts must work in any country and in a small flat.',
    'Do not number them, do not explain them, and do not repeat a prompt in different words.',
    `Category: ${request.category}. ${request.brief}`,
    'difficulty is 1 for something almost everybody has within reach, 2 for a short hunt, 3 for a real search.',
  ].join('\n');
}

export interface GeminiTopicGeneratorOptions {
  apiKeys: string | string[];
  model?: string;
  fetcher?: typeof fetch;
}

export class GeminiTopicGenerator {
  private readonly keys: GeminiKeyPool;
  private readonly model: string;
  private readonly fetcher: typeof fetch;

  constructor(options: GeminiTopicGeneratorOptions) {
    this.keys = new GeminiKeyPool(options.apiKeys);
    this.model = options.model ?? 'gemini-2.5-flash';
    this.fetcher = options.fetcher ?? fetch;
    if (!/^[a-zA-Z0-9.-]+$/.test(this.model)) throw new Error('Invalid GEMINI_MODEL.');
  }

  /**
   * Asks for one category's worth of prompts and returns only what survives.
   *
   * `taken` is mutated as candidates are accepted, so two categories in the
   * same run cannot both contribute the same sentence.
   */
  async generate(
    request: TopicRequest,
    taken: Set<string>,
    signal: AbortSignal,
  ): Promise<{ accepted: TopicCandidate[]; rejected: Record<TopicRejection, number> }> {
    const rejected = emptyRejections();
    const raw = await this.ask(request, signal);
    const accepted: TopicCandidate[] = [];

    for (const candidate of raw) {
      const check = validateTopic(
        {
          prompt: candidate.prompt,
          category: request.category,
          ...(candidate.difficulty ? { difficulty: candidate.difficulty } : {}),
          visual: request.visual,
        },
        taken,
      );
      if (!check.ok) {
        rejected[check.reason] = (rejected[check.reason] ?? 0) + 1;
        continue;
      }
      taken.add(check.topic.prompt);
      accepted.push(check.topic);
    }

    return { accepted, rejected };
  }

  private async ask(
    request: TopicRequest,
    signal: AbortSignal,
  ): Promise<{ prompt: string; difficulty?: number }[]> {
    const tried = new Set<string>();
    for (let attempt = 0; attempt < 3; attempt++) {
      const key = this.keys.take(tried);
      if (!key) break;
      tried.add(key);
      signal.throwIfAborted();

      const response = await this.fetcher(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`,
        {
          method: 'POST',
          signal,
          headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: instructions(request) }] },
            contents: [
              {
                role: 'user',
                parts: [{ text: `Write ${request.count} prompts for this category.` }],
              },
            ],
            generationConfig: {
              temperature: 1.1,
              maxOutputTokens: 8192,
              responseMimeType: 'application/json',
              responseJsonSchema: RESPONSE_JSON_SCHEMA,
            },
          }),
        },
      );

      if (response.status === 429) {
        this.keys.cooldown(key, await quotaCooldown(response));
        continue;
      }
      if (response.status === 401 || response.status === 403) {
        this.keys.disable(key);
        continue;
      }
      if (!response.ok) throw new Error(`Gemini returned HTTP ${response.status}`);

      const body = envelopeSchema.parse(await response.json());
      const text = body.candidates[0]!.content.parts
        .filter((p) => !p.thought)
        .map((p) => p.text ?? '')
        .join('');
      return responseSchema.parse(JSON.parse(text)).prompts;
    }

    throw new TopicsUnavailable('No usable Gemini key for this request.');
  }
}

/** The model could not be reached. The pool on disk is what the game keeps using. */
export class TopicsUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TopicsUnavailable';
  }
}

export function emptyRejections(): Record<TopicRejection, number> {
  return {
    'too-short': 0,
    'too-long': 0,
    'unsupported-characters': 0,
    'no-instruction': 0,
    'needs-something-not-here': 0,
    duplicate: 0,
  };
}

/**
 * The categories a run asks for.
 *
 * Written out rather than generated, because the shape of the pool is an
 * editorial decision and not one a model should be making about itself. The
 * split between what a photograph settles and what it cannot is the same split
 * the referee already respects.
 */
export const TOPIC_REQUESTS: readonly Omit<TopicRequest, 'count'>[] = [
  {
    category: 'object',
    visual: true,
    brief: 'Ordinary things to fetch and hold up. Name the thing, not a category.',
  },
  {
    category: 'material',
    visual: true,
    brief: 'What a thing is made of: wood, metal, glass, fabric, paper.',
  },
  {
    category: 'shape',
    visual: true,
    brief: 'Shape, edges, holes, symmetry. Nothing that needs measuring.',
  },
  {
    category: 'count',
    visual: true,
    brief: 'Numbers printed on things, and small counts of things held up together.',
  },
  {
    category: 'letter',
    visual: true,
    brief: 'Spelling and names of objects. Keep the letter rules simple.',
  },
  {
    category: 'tech',
    visual: true,
    brief: 'Devices, cables, ports, screens and the things that charge them.',
  },
  {
    category: 'kitchen',
    visual: true,
    brief: 'Food, drink, packaging and the tools around them.',
  },
  {
    category: 'print',
    visual: true,
    brief: 'Books, labels, receipts, handwriting and anything with words on it.',
  },
  {
    category: 'wear',
    visual: true,
    brief: 'Clothing and things worn, including the ones nobody wears.',
  },
  {
    category: 'action',
    visual: true,
    brief: 'Things to do on camera with objects already in the room.',
  },
  {
    category: 'story',
    visual: false,
    brief: 'Where a thing came from, who gave it, how long it has been kept.',
  },
  {
    category: 'value',
    visual: false,
    brief: 'What a thing is worth, to the player or to anybody.',
  },
  {
    category: 'confession',
    visual: false,
    brief: 'The untidy, the unused and the mildly embarrassing.',
  },
  {
    category: 'hypothetical',
    visual: false,
    brief: 'What you would take, use, save or sacrifice. Always answerable with a real object.',
  },
  {
    category: 'debate',
    visual: false,
    brief: 'Opinions worth arguing about, settled by holding up an object.',
  },
  {
    category: 'weird',
    visual: false,
    brief: 'The strange, the inexplicable and the funny. Never cruel.',
  },
];
