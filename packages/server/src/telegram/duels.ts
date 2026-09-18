import { randomBytes } from 'node:crypto';
import type { Database } from '../database.js';
import type { Social } from './social.js';

/**
 * One player challenging another by name.
 *
 * The obvious implementation is to open a room and share its code. It is also
 * wrong, because the person you want to play is usually not looking at their
 * phone: a room with nobody in it is collected in five minutes, so the invite
 * expires before it is read.
 *
 * So a challenge is a **record**, not a room. It survives both players being
 * offline, it can be accepted tomorrow, and the room is opened by whichever of
 * them turns up first — at which point the second one joins the same room code,
 * because the challenge remembers it.
 *
 * The code is 96 bits from the CSPRNG rather than a five-character room code:
 * a room code is guessable on purpose, since a friend reads it aloud, and a
 * challenge carries an authorisation that a room code does not.
 */

/** A challenge outlives a conversation, not a week. */
const TTL_MS = 24 * 60 * 60_000;
/** Open challenges one player may have at once, so a share sheet is not a spam gun. */
const MAX_OPEN = 5;

export type DuelStatus =
  | 'pending'
  | 'accepted'
  | 'playing'
  | 'completed'
  | 'expired'
  | 'declined';

export interface Duel {
  code: string;
  hostAccountId: string;
  guestAccountId: string | null;
  status: DuelStatus;
  roomCode: string | null;
  createdAt: number;
  expiresAt: number;
}

function toDuel(row: Record<string, unknown>): Duel {
  return {
    code: String(row.code),
    hostAccountId: String(row.host_account_id),
    guestAccountId:
      row.guest_account_id === null || row.guest_account_id === undefined
        ? null
        : String(row.guest_account_id),
    status: String(row.status) as DuelStatus,
    roomCode: row.room_code === null || row.room_code === undefined ? null : String(row.room_code),
    createdAt: Number(row.created_at),
    expiresAt: Number(row.expires_at),
  };
}

export class Duels {
  constructor(
    private readonly db: Database,
    private readonly social: Social,
  ) {}

  get(code: string, now: number): Duel | null {
    if (!/^[A-Za-z0-9_-]{16,32}$/.test(code)) return null;
    const row = this.db.sql.prepare('SELECT * FROM telegram_duels WHERE code=?').get(code);
    if (!row) return null;
    const duel = toDuel(row);
    if (duel.status === 'pending' && duel.expiresAt <= now) return { ...duel, status: 'expired' };
    return duel;
  }

  /** Creates an open challenge, or says why it could not. */
  create(
    hostAccountId: string,
    now: number,
  ): { ok: true; duel: Duel } | { ok: false; reason: 'too-many' } {
    return this.db.transaction(() => {
      this.db.sql
        .prepare("UPDATE telegram_duels SET status='expired' WHERE status='pending' AND expires_at<=?")
        .run(now);
      const open = Number(
        this.db.sql
          .prepare("SELECT count(*) AS n FROM telegram_duels WHERE host_account_id=? AND status='pending'")
          .get(hostAccountId)!.n,
      );
      if (open >= MAX_OPEN) return { ok: false as const, reason: 'too-many' as const };

      const code = randomBytes(12).toString('base64url');
      this.db.sql
        .prepare("INSERT INTO telegram_duels VALUES(?,?,NULL,'pending',NULL,?,?,NULL,NULL)")
        .run(code, hostAccountId, now, now + TTL_MS);
      return {
        ok: true as const,
        duel: {
          code,
          hostAccountId,
          guestAccountId: null,
          status: 'pending' as const,
          roomCode: null,
          createdAt: now,
          expiresAt: now + TTL_MS,
        },
      };
    });
  }

  /**
   * Accepts a challenge.
   *
   * The update carries the whole authorisation: it only matches a row that is
   * still pending and still has no guest, so two people opening the same link
   * at once cannot both become the opponent.
   */
  accept(
    code: string,
    guestAccountId: string,
    now: number,
  ):
    | { ok: true; duel: Duel }
    | { ok: false; reason: 'unknown' | 'expired' | 'taken' | 'own' | 'blocked' } {
    const duel = this.get(code, now);
    if (!duel) return { ok: false, reason: 'unknown' };
    if (duel.hostAccountId === guestAccountId) return { ok: false, reason: 'own' };
    if (duel.status === 'expired') return { ok: false, reason: 'expired' };
    if (duel.guestAccountId)
      return duel.guestAccountId === guestAccountId
        ? { ok: true, duel }
        : { ok: false, reason: 'taken' };
    if (this.social.blocksEitherWay(duel.hostAccountId, guestAccountId))
      return { ok: false, reason: 'blocked' };

    const updated = this.db.sql
      .prepare(
        `UPDATE telegram_duels SET guest_account_id=?, status='accepted', accepted_at=?
         WHERE code=? AND status='pending' AND guest_account_id IS NULL AND expires_at>?`,
      )
      .run(guestAccountId, now, code, now);
    if (!updated.changes) return { ok: false, reason: 'taken' };
    return { ok: true, duel: { ...duel, guestAccountId, status: 'accepted' } };
  }

  decline(code: string, guestAccountId: string, now: number): boolean {
    return (
      this.db.sql
        .prepare(
          "UPDATE telegram_duels SET status='declined' WHERE code=? AND status IN ('pending','accepted') AND (guest_account_id IS NULL OR guest_account_id=?) AND expires_at>?",
        )
        .run(code, guestAccountId, now).changes > 0
    );
  }

  cancel(code: string, hostAccountId: string): boolean {
    return (
      this.db.sql
        .prepare(
          "UPDATE telegram_duels SET status='declined' WHERE code=? AND host_account_id=? AND status IN ('pending','accepted')",
        )
        .run(code, hostAccountId).changes > 0
    );
  }

  /**
   * Claims the room this challenge will be played in.
   *
   * Whoever asks first causes a room to be opened — `openRoom` is the server's
   * own room manager, not anything a client can influence — and whoever asks
   * second is handed the same code. That is what makes "join the exact room"
   * true without ever trusting a room code that arrived from a browser.
   */
  claimRoom(
    code: string,
    accountId: string,
    now: number,
    openRoom: () => string,
  ):
    | { ok: true; roomCode: string; opponentAccountId: string }
    | { ok: false; reason: 'unknown' | 'not-yours' | 'not-ready' | 'over' } {
    return this.db.transaction(() => {
      const duel = this.get(code, now);
      if (!duel) return { ok: false as const, reason: 'unknown' as const };
      if (duel.hostAccountId !== accountId && duel.guestAccountId !== accountId)
        return { ok: false as const, reason: 'not-yours' as const };
      if (duel.status === 'completed' || duel.status === 'declined' || duel.status === 'expired')
        return { ok: false as const, reason: 'over' as const };
      if (!duel.guestAccountId) return { ok: false as const, reason: 'not-ready' as const };

      const opponentAccountId =
        duel.hostAccountId === accountId ? duel.guestAccountId : duel.hostAccountId;
      if (duel.roomCode) return { ok: true as const, roomCode: duel.roomCode, opponentAccountId };

      const roomCode = openRoom();
      this.db.sql
        .prepare("UPDATE telegram_duels SET room_code=?, status='playing' WHERE code=?")
        .run(roomCode, code);
      return { ok: true as const, roomCode, opponentAccountId };
    });
  }

  /** Marks a challenge finished, so it stops appearing as something to do. */
  complete(roomCode: string, now: number): Duel | null {
    const row = this.db.sql
      .prepare("SELECT * FROM telegram_duels WHERE room_code=? AND status='playing'")
      .get(roomCode);
    if (!row) return null;
    this.db.sql
      .prepare("UPDATE telegram_duels SET status='completed', settled_at=? WHERE code=?")
      .run(now, String(row.code));
    return { ...toDuel(row), status: 'completed' };
  }

  /** Whether a room was opened for a challenge. Quests ask; nothing else does. */
  isChallengeRoom(roomCode: string): boolean {
    return Boolean(
      this.db.sql.prepare('SELECT 1 FROM telegram_duels WHERE room_code=?').get(roomCode),
    );
  }

  /** Challenges somebody sent this player that are still worth showing. */
  incoming(accountId: string, now: number): Duel[] {
    return this.db.sql
      .prepare(
        `SELECT * FROM telegram_duels
         WHERE guest_account_id=? AND status IN ('accepted','playing') AND expires_at>?
         ORDER BY created_at DESC LIMIT 10`,
      )
      .all(accountId, now)
      .map(toDuel);
  }

  /** Challenges this player is waiting on an answer to. */
  outgoing(accountId: string, now: number): Duel[] {
    return this.db.sql
      .prepare(
        `SELECT * FROM telegram_duels
         WHERE host_account_id=? AND status IN ('pending','accepted','playing') AND expires_at>?
         ORDER BY created_at DESC LIMIT 10`,
      )
      .all(accountId, now)
      .map(toDuel);
  }
}
