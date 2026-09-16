import { afterEach, describe, expect, it } from 'vitest';
import {
  CHALLENGES,
  getChallenge,
  rankFor,
  type PublicMatchState,
  type ServerMessage,
} from '@battle/shared';
import { Database } from '../src/database.js';
import { blankProfile } from '../src/profiles.js';
import { Room } from '../src/room.js';
import { buildBoard } from '../src/leaderboard.js';
import { emptyRoomFrame, passingFrameFor, failingFrameFor } from './helpers.js';

let db: Database;
afterEach(() => db?.close());
function battle(at: number) {
  const room = new Room('FLOW1', at, {
    profiles: db,
    ranked: true,
    pool: CHALLENGES.filter((c) => c.judging === 'auto'),
  });
  const messages: ServerMessage[][] = [[], []];
  const seats = ['a', 'b'].map((identity, i) => {
    const joined = room.join(identity, at);
    room.attach(joined.playerId!, (m) => messages[i]!.push(m), at);
    room.identify(joined.playerId!, identity, at);
    room.handle(joined.playerId!, { t: 'cameraReady', ready: true }, at);
    return joined;
  });
  const state = (): PublicMatchState =>
    (
      [...messages[0]!].reverse().find((m) => m.t === 'state') as Extract<
        ServerMessage,
        { t: 'state' }
      >
    ).state;
  return { room, messages, seats, state };
}
function drive(h: ReturnType<typeof battle>, at: number, stopAfterRound = false) {
  for (const seat of h.seats) h.room.handle(seat.playerId!, { t: 'ready', ready: true }, at);
  for (let i = 1; i < 180; i++) {
    const now = at + i * 1000;
    for (const seat of h.seats)
      h.room.handle(seat.playerId!, { t: 'frame', image: emptyRoomFrame(), seq: i }, now);
    h.room.tick(now);
    const state = h.state();
    if (state.phase === 'matchResult' || (stopAfterRound && state.history.length)) return now;
    if (
      state.phase !== 'challenge' ||
      !state.round ||
      state.players[h.seats[0]!.playerId!]?.submitted
    )
      continue;
    const detector = getChallenge(state.round.challengeId)!.detector!;
    h.room.handle(
      h.seats[0]!.playerId!,
      { t: 'submit', roundId: state.round.id, image: passingFrameFor(detector) },
      now + 100,
    );
    h.room.handle(
      h.seats[1]!.playerId!,
      { t: 'submit', roundId: state.round.id, image: failingFrameFor(detector) },
      now + 200,
    );
  }
  throw new Error('Battle did not finish');
}
function accounts() {
  db = new Database(':memory:');
  // Fixture credentials are never used; real credential/session flows have HTTP tests.
  for (const id of ['a', 'b']) {
    db.save({ ...blankProfile(id, 0), name: id });
    db.sql
      .prepare('INSERT INTO accounts(id,username,password_hash,recovery_hash,onboarded,created_at) VALUES(?,?,?,?,?,?)')
      .run(id, id, 'fixture', 'fixture', 1, 0);
  }
}

describe('ranked match to persistent progression', () => {
  it('plays through placement, XP, promotion, rewards, private history and the public ladder', () => {
    accounts();
    const initialRank = rankFor(db.get('a')!.rating).label;
    for (let day = 0; day < 8; day++) {
      const at = Date.UTC(2026, 8, 1 + day);
      const h = battle(at);
      drive(h, at);
      expect(h.state().phase).toBe('matchResult');
      expect(h.state().winnerId).toBe(h.seats[0]!.playerId);
      const standings = [...h.messages[0]!].reverse().find((m) => m.t === 'standings') as Extract<
        ServerMessage,
        { t: 'standings' }
      >;
      expect(standings.lastMatch![h.seats[0]!.playerId!]).not.toHaveProperty('profile');
      expect(standings.players[h.seats[1]!.playerId!]!.history).toBeUndefined();
      expect(db.get('a')!.matchesPlayed).toBe(day + 1);
      const xp = db.get('a')!.xp;
      h.room.tick(at + 999999);
      expect(db.get('a')!.xp).toBe(xp);
      expect(buildBoard(db, 'rating', 'a').total).toBe(day < 4 ? 0 : 2);
    }
    const winner = db.get('a')!;
    expect(winner.wins).toBe(8);
    expect(winner.history).toHaveLength(8);
    expect(winner.history[0]!.topicIds!.length).toBeGreaterThan(0);
    expect(winner.achievements).toContain('opening-night');
    expect(winner.achievements).toContain('the-long-one');
    expect(winner.xp).toBeGreaterThan(600);
    expect(rankFor(winner.rating).label).not.toBe(initialRank);
    expect(buildBoard(db, 'rating', 'a').you!.position).toBe(1);
    expect(db.sql.prepare('PRAGMA integrity_check').get()!.integrity_check).toBe('ok');
  }, 15000);
  it('settles a forfeit atomically, gives the quitter no XP, and never sends them a stale room state', () => {
    accounts();
    const at = Date.UTC(2026, 8, 13);
    const h = battle(at);
    const now = drive(h, at, true);
    const before = h.messages[1]!.length;
    h.room.remove(h.seats[1]!.playerId!, now + 1);
    expect(h.state().endReason).toBe('forfeit');
    expect(db.get('a')!.wins).toBe(1);
    expect(db.get('b')!.losses).toBe(1);
    expect(db.get('b')!.xp).toBe(0);
    expect(db.get('b')!.history[0]!.forfeited).toBe(true);
    expect(db.queueCooldown('b')).toBe(now + 1 + 300000);
    expect(h.messages[1]!.length).toBe(before);
    expect(h.room.rejoin(h.seats[1]!.token!, now + 2, 'b').ok).toBe(false);
  });
  it('does not let a stolen reconnect token cross account boundaries', () => {
    accounts();
    const h = battle(0);
    expect(h.room.rejoin(h.seats[0]!.token!, 100, 'b').ok).toBe(false);
    expect(h.room.rejoin(h.seats[0]!.token!, 100, null).ok).toBe(false);
    expect(h.room.rejoin(h.seats[0]!.token!, 100, 'a').ok).toBe(true);
  });
});
