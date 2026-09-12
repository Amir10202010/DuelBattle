/**
 * Rebuilds the topic pool.
 *
 *   npm run topics:generate            -- top the pool up towards its target
 *   npm run topics:generate -- --dry   -- report what would change, write nothing
 *   npm run topics:generate -- --target 1200
 *
 * Additive by design. Existing topics are kept, because an id is referenced by
 * a room's recent-prompt memory and by match history, and because a pool that
 * churns on every run is a pool nobody can review. What a run does is fill the
 * gap between what is there and what is wanted, category by category.
 *
 * With no GEMINI_API_KEYS this exits having changed nothing and says so. That
 * is the supported case, not an error: the pool in the repository is the game's
 * actual content, and a machine without keys still builds and plays it.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CHALLENGES, TOPICS, validateTopic, type TopicCandidate } from '@battle/shared';
import { config } from '../src/config.js';
import { GeminiTopicGenerator, TOPIC_REQUESTS, emptyRejections } from '../src/ai/topics.js';

const POOL_PATH = fileURLToPath(new URL('../../shared/src/topics/pool.ts', import.meta.url));

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const dryRun = process.argv.includes('--dry');
const target = Number.parseInt(arg('target') ?? '1000', 10);

function header(): string {
  const source = readFileSync(POOL_PATH, 'utf8');
  const end = source.indexOf('export const RAW_TOPICS');
  return source.slice(0, end);
}

function write(topics: readonly TopicCandidate[]): void {
  const rows = topics
    .map(
      (t) =>
        `  [${JSON.stringify(t.prompt)}, ${JSON.stringify(t.category)}, ${t.difficulty}, ${t.visual ? 1 : 0}],`,
    )
    .join('\n');
  writeFileSync(POOL_PATH, `${header()}export const RAW_TOPICS: readonly RawTopic[] = [\n${rows}\n];\n`);
}

async function main(): Promise<void> {
  const existing: TopicCandidate[] = TOPICS.map((t) => ({
    prompt: t.prompt,
    category: t.category,
    difficulty: t.difficulty,
    visual: t.visual,
  }));

  // The catalogue counts as taken too: a generated duplicate of a hand-written
  // prompt would be dealt twice under two different ids.
  const taken = new Set([...existing.map((t) => t.prompt), ...CHALLENGES.map((c) => c.prompt)]);

  const shortfall = Math.max(0, target - existing.length);
  if (shortfall === 0) {
    console.log(`Pool holds ${existing.length} topics, target is ${target}. Nothing to do.`);
    return;
  }

  if (config.geminiApiKeys.length === 0) {
    console.log(
      `Pool holds ${existing.length} topics, ${shortfall} short of ${target}.\n` +
        'Set GEMINI_API_KEYS to generate more. The pool in the repository is unchanged and the game plays fine without this.',
    );
    process.exitCode = 0;
    return;
  }

  const generator = new GeminiTopicGenerator({
    apiKeys: config.geminiApiKeys,
    model: config.geminiModel,
  });

  const perCategory = Math.ceil(shortfall / TOPIC_REQUESTS.length);
  const accepted: TopicCandidate[] = [];
  const rejected = emptyRejections();
  const unavailable: string[] = [];

  for (const request of TOPIC_REQUESTS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);
    try {
      const result = await generator.generate(
        { ...request, count: Math.min(60, perCategory) },
        taken,
        controller.signal,
      );
      accepted.push(...result.accepted);
      for (const [reason, count] of Object.entries(result.rejected)) {
        rejected[reason as keyof typeof rejected] += count;
      }
      console.log(
        `${request.category}: +${result.accepted.length} (refused ${Object.values(result.rejected).reduce((a, b) => a + b, 0)})`,
      );
    } catch (err) {
      unavailable.push(request.category);
      console.warn(`${request.category}: unavailable — ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      clearTimeout(timer);
    }
  }

  // A last pass over everything, so a bug in the generator cannot slip a bad
  // row into the file: the pool is only ever written from validated input.
  const finalTaken = new Set(CHALLENGES.map((c) => c.prompt));
  const merged: TopicCandidate[] = [];
  for (const topic of [...existing, ...accepted]) {
    const check = validateTopic(topic, finalTaken);
    if (!check.ok) continue;
    finalTaken.add(check.topic.prompt);
    merged.push(check.topic);
  }

  console.log(
    `\n${existing.length} → ${merged.length} topics.` +
      `\nrefused: ${JSON.stringify(rejected)}` +
      (unavailable.length ? `\nno answer for: ${unavailable.join(', ')}` : ''),
  );

  if (dryRun) {
    console.log('Dry run: pool.ts left alone.');
    return;
  }
  write(merged);
  console.log(`Wrote ${POOL_PATH}`);
}

await main();
