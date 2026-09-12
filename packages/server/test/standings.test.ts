import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { STARTING_RATING, levelFor, matchXp } from '@battle/shared';
import { Identities } from '../src/identity.js';
import {
  FileProfileStore,
  HISTORY_KEPT,
  MemoryProfileStore,
  blankProfile,
} from '../src/profiles.js';
import { plainSummary, profileFor, recordMatch } from '../src/standings.js';

/** A contestant with a bare summary: these tests are about ratings, not badges. */
function who(id: string, name: string, score: number, against = 0) {
  return { id, name, score, summary: plainSummary({ yourScore: score, theirScore: against }) };
}

const secret = Buffer.alloc(32, 7);
const temps: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'battle-profiles-'));
  temps.push(dir);
  return dir;
}

afterEach(() => {
  while (temps.length) rmSync(temps.pop()!, { recursive: true, force: true });
});

describe('identity', () => {
  it('issues a token it will recognise again', () => {
    const identities = new Identities(secret);
    const token = identities.issue();
    expect(identities.verify(token)).toBeTruthy();
  });

  it('gives everybody a different one', () => {
    const identities = new Identities(secret);
    const seen = new Set(Array.from({ length: 200 }, () => identities.verify(identities.issue())));
    expect(seen.size).toBe(200);
  });

  it('refuses an id somebody just made up', () => {
    // Otherwise "I am player X" is a claim anybody can type, and a rating is
    // something you can take off somebody by guessing their id.
    const identities = new Identities(secret);
    expect(identities.verify('someone-elses-id.and-a-guess')).toBeNull();
    expect(identities.verify('no-signature-at-all')).toBeNull();
    expect(identities.verify('')).toBeNull();
    expect(identities.verify(null)).toBeNull();
    expect(identities.verify(42)).toBeNull();
  });

  it('refuses a token signed with a different secret', () => {
    const token = new Identities(Buffer.alloc(32, 1)).issue();
    expect(new Identities(Buffer.alloc(32, 2)).verify(token)).toBeNull();
  });

  it('refuses a token whose id has been edited under its signature', () => {
    const identities = new Identities(secret);
    const token = identities.issue();
    const [id, signature] = token.split('.');
    expect(identities.verify(`${id!.slice(0, -1)}X.${signature}`)).toBeNull();
  });

  it('refuses an absurdly long token rather than hashing it', () => {
    const identities = new Identities(secret);
    expect(identities.verify(`${'a'.repeat(500)}.sig`)).toBeNull();
  });

  it('will not start on a secret too short to be one', () => {
    expect(() => new Identities(Buffer.alloc(4))).toThrow(/at least 16 bytes/);
  });
});

describe('recording a match', () => {
  const at = 1_700_000_000_000;

  it('starts both players at the same rating and moves them opposite ways', () => {
    const store = new MemoryProfileStore();
    const updates = recordMatch(store, who('a', 'Ada', 3), who('b', 'Grace', 1), at);

    expect(updates.a!.before).toBe(STARTING_RATING);
    expect(updates.a!.change).toBeGreaterThan(0);
    expect(updates.b!.change).toBeLessThan(0);
    expect(updates.a!.change + updates.b!.change).toBe(0);
  });

  it('computes both ratings against the same snapshot', () => {
    // Updating one and feeding the new number into the other would tilt the
    // exchange by a point, and which way would depend on argument order.
    const store = new MemoryProfileStore();
    store.save({ ...blankProfile('a', at), rating: 1400, matchesPlayed: 30 });
    store.save({ ...blankProfile('b', at), rating: 1100, matchesPlayed: 30 });

    const forwards = recordMatch(store, who('a', 'A', 3), who('b', 'B', 0), at);

    const mirror = new MemoryProfileStore();
    mirror.save({ ...blankProfile('a', at), rating: 1400, matchesPlayed: 30 });
    mirror.save({ ...blankProfile('b', at), rating: 1100, matchesPlayed: 30 });
    const backwards = recordMatch(mirror, who('b', 'B', 0), who('a', 'A', 3), at);

    expect(forwards.a!.change).toBe(backwards.a!.change);
    expect(forwards.b!.change).toBe(backwards.b!.change);
  });

  it('counts a draw as a draw for both', () => {
    const store = new MemoryProfileStore();
    const updates = recordMatch(store, who('a', 'A', 2), who('b', 'B', 2), at);
    expect(store.get('a')!.draws).toBe(1);
    expect(store.get('b')!.draws).toBe(1);
    expect(updates.a!.change).toBe(0);
  });

  it('keeps a win streak, and a loss ends it', () => {
    const store = new MemoryProfileStore();
    for (let i = 0; i < 3; i++) {
      recordMatch(store, who('a', 'A', 3), who('b', 'B', 0), at + i);
    }
    expect(store.get('a')!.streak).toBe(3);
    expect(store.get('a')!.bestStreak).toBe(3);

    recordMatch(store, who('a', 'A', 0), who('b', 'B', 3), at + 10);
    expect(store.get('a')!.streak).toBe(0);
    // The best is a record, so it stands.
    expect(store.get('a')!.bestStreak).toBe(3);
  });

  it('remembers the last few matches and no more', () => {
    const store = new MemoryProfileStore();
    for (let i = 0; i < HISTORY_KEPT + 6; i++) {
      recordMatch(store, who('a', 'A', 3), who('b', 'B', i % 3), at + i);
    }
    const history = store.get('a')!.history;
    expect(history).toHaveLength(HISTORY_KEPT);
    // Newest first.
    expect(history[0]!.at).toBeGreaterThan(history[1]!.at);
  });

  it('records what the opponent was called at the time', () => {
    const store = new MemoryProfileStore();
    recordMatch(store, who('a', 'Ada', 3), who('b', 'Grace', 1), at);
    expect(store.get('a')!.history[0]!.opponentName).toBe('Grace');
    expect(store.get('a')!.history[0]!.yourScore).toBe(3);
    expect(store.get('a')!.history[0]!.theirScore).toBe(1);
  });

  it('takes the newest display name without losing the record behind it', () => {
    const store = new MemoryProfileStore();
    recordMatch(store, who('a', 'Ada', 3), who('b', 'B', 1), at);
    recordMatch(store, who('a', 'Ada L.', 3), who('b', 'B', 1), at + 1);
    expect(store.get('a')!.name).toBe('Ada L.');
    expect(store.get('a')!.matchesPlayed).toBe(2);
  });

  it('reads a card for somebody who has never played without inventing a row', () => {
    const store = new MemoryProfileStore();
    const card = profileFor(store, 'nobody', 'Newcomer', at);
    expect(card.rating).toBe(STARTING_RATING);
    expect(card.matchesPlayed).toBe(0);
    expect(store.size).toBe(0);
  });
});

describe('profiles that survive a restart', () => {
  const at = 1_700_000_000_000;

  it('reads back what it wrote', () => {
    const dir = tempDir();
    const store = new FileProfileStore(dir, 0);
    recordMatch(store, who('a', 'Ada', 3), who('b', 'Grace', 1), at);
    store.close();

    const reopened = new FileProfileStore(dir, 0);
    expect(reopened.get('a')!.name).toBe('Ada');
    expect(reopened.get('a')!.wins).toBe(1);
    expect(reopened.get('b')!.losses).toBe(1);
    reopened.close();
  });

  it('starts clean on a first run', () => {
    const store = new FileProfileStore(tempDir(), 0);
    expect(store.size).toBe(0);
    store.close();
  });

  it('leaves an unreadable file alone rather than overwriting it', () => {
    // Losing every rating in the room to one bad byte, silently, is worse than
    // starting empty and saying so.
    const dir = tempDir();
    const path = join(dir, 'profiles.json');
    writeFileSync(path, '{ not json at all', 'utf8');

    const store = new FileProfileStore(dir, 0);
    expect(store.size).toBe(0);
    store.close();

    expect(readFileSync(path, 'utf8')).toBe('{ not json at all');
  });

  it('writes through a temp file, so a crash cannot leave half a file', () => {
    const dir = tempDir();
    const store = new FileProfileStore(dir, 0);
    recordMatch(store, who('a', 'A', 1), who('b', 'B', 0), at);
    store.close();

    const raw = readFileSync(join(dir, 'profiles.json'), 'utf8');
    expect(() => JSON.parse(raw)).not.toThrow();
    expect(JSON.parse(raw)).toHaveLength(2);
  });

  it('skips a row that is not a profile instead of failing the load', () => {
    const dir = tempDir();
    writeFileSync(
      join(dir, 'profiles.json'),
      JSON.stringify([{ id: 'good', rating: 1200 }, { nonsense: true }, null]),
      'utf8',
    );
    const store = new FileProfileStore(dir, 0);
    expect(store.size).toBe(1);
    expect(store.get('good')!.rating).toBe(1200);
    store.close();
  });
});

describe('what a match pays out', () => {
  const at = 1_700_000_000_000;

  /** A contestant with a real match behind them, for the reward rules. */
  function played(
    id: string,
    name: string,
    score: number,
    against: number,
    over: Partial<ReturnType<typeof plainSummary>> = {},
  ) {
    return {
      id,
      name,
      score,
      summary: { ...plainSummary({ yourScore: score, theirScore: against }), validAnswers: score, ...over },
    };
  }

  it('pays XP for a loss as well as a win', () => {
    const store = new MemoryProfileStore();
    const updates = recordMatch(store, played('a', 'A', 3, 1), played('b', 'B', 1, 3), at);
    expect(updates.a!.rewards.xp).toBeGreaterThan(updates.b!.rewards.xp);
    expect(updates.b!.rewards.xp).toBeGreaterThan(0);
  });

  it('adds the XP an award is worth to the XP the match was worth', () => {
    const store = new MemoryProfileStore();
    const updates = recordMatch(store, played('a', 'A', 3, 0), played('b', 'B', 0, 3), at);
    const base = matchXp({ result: 'win', roundsWon: 3, validAnswers: 3, streak: 1 });
    // A first win also unlocks Opening Night, First Blood and Clean Sheet.
    expect(updates.a!.rewards.xp).toBeGreaterThan(base);
    expect(updates.a!.rewards.unlocked).toContain('clean-sheet');
    expect(updates.a!.rewards.unlocked).toContain('first-blood');
  });

  it('never awards the same thing twice', () => {
    const store = new MemoryProfileStore();
    recordMatch(store, played('a', 'A', 3, 0), played('b', 'B', 0, 3), at);
    const second = recordMatch(store, played('a', 'A', 3, 0), played('b', 'B', 0, 3), at + 1);
    expect(second.a!.rewards.unlocked).not.toContain('clean-sheet');
    expect(new Set(store.get('a')!.achievements).size).toBe(store.get('a')!.achievements.length);
  });

  it('only says somebody levelled up when they did', () => {
    const store = new MemoryProfileStore();
    const first = recordMatch(store, played('a', 'A', 3, 1), played('b', 'B', 1, 3), at);
    expect(first.a!.rewards.levelAfter).toBeGreaterThanOrEqual(first.a!.rewards.levelBefore);
    expect(first.a!.rewards.levelAfter).toBe(levelFor(store.get('a')!.xp).level);
  });

  it('keeps a peak rating that a bad run cannot take back', () => {
    const store = new MemoryProfileStore();
    store.save({ ...blankProfile('a', at), rating: 1400, peakRating: 1400, matchesPlayed: 30 });
    store.save({ ...blankProfile('b', at), rating: 1400, matchesPlayed: 30 });
    recordMatch(store, played('a', 'A', 0, 3), played('b', 'B', 3, 0), at);
    expect(store.get('a')!.rating).toBeLessThan(1400);
    expect(store.get('a')!.peakRating).toBe(1400);
  });

  it('reports a promotion only when the rung actually changed', () => {
    const store = new MemoryProfileStore();
    // Both are a handful of points above a rung, so one upset moves them past
    // it in opposite directions.
    store.save({ ...blankProfile('a', at), rating: 1090, matchesPlayed: 30 });
    store.save({ ...blankProfile('b', at), rating: 1370, matchesPlayed: 30 });
    const updates = recordMatch(store, played('a', 'A', 3, 0), played('b', 'B', 0, 3), at);
    expect(updates.a!.after).toBeGreaterThanOrEqual(1100);
    expect(updates.a!.rewards.rankMove).toBe('promoted');
    expect(updates.b!.rewards.rankMove).toBe('demoted');
  });

  it('writes what the match paid into the history row', () => {
    const store = new MemoryProfileStore();
    const updates = recordMatch(store, played('a', 'A', 3, 1), played('b', 'B', 1, 3), at);
    expect(store.get('a')!.history[0]!.xp).toBe(updates.a!.rewards.xp);
  });

  it('notices a match that used every referee it had', () => {
    const store = new MemoryProfileStore();
    const updates = recordMatch(
      store,
      played('a', 'A', 3, 1, { wonByJudge: { auto: 1, peer: 1, ai: 1 } }),
      played('b', 'B', 1, 3),
      at,
    );
    expect(updates.a!.rewards.unlocked).toContain('all-three');
    expect(updates.b!.rewards.unlocked).not.toContain('all-three');
  });
});
