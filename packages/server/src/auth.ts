import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { z } from 'zod';
import { nameSchema } from '@battle/shared/validation';
import { blankProfile, publicView } from './profiles.js';
import type { Database } from './database.js';
import type { Identities } from './identity.js';

export const credentialsSchema = z
  .object({
    username: z
      .string()
      .trim()
      .toLowerCase()
      .max(254)
      .regex(/^(?:[a-z0-9_]{3,24}|[^\s@]+@[^\s@]+\.[^\s@]+)$/, 'Enter your email or player ID.'),
    password: z.string().min(12, 'Use at least 12 characters.').max(128),
  })
  .strict();
export const registrationSchema = credentialsSchema.extend({
  name: nameSchema,
  legacyIdentity: z.string().max(256).optional(),
});
const SESSION_AGE = 14 * 86_400_000;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

async function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(
      password,
      salt,
      64,
      { N: 131072, r: 8, p: 1, maxmem: 160 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await derive(password, salt)).toString('hex')}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(stored)) stored = `${'0'.repeat(32)}:${'0'.repeat(128)}`;
  const [salt, hex] = stored.split(':');
  const actual = await derive(password, salt!);
  const expected = Buffer.from(hex!, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export class AuthError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface Account {
  id: string;
  username: string;
  onboarded: boolean;
}

export class AuthService {
  private hashing = 0;
  constructor(
    readonly db: Database,
    private readonly identities?: Identities,
  ) {}

  private async budget<T>(work: () => Promise<T>): Promise<T> {
    if (this.hashing >= 2) throw new AuthError(429, 'Sign-in is busy. Try again in a moment.');
    this.hashing++;
    try {
      return await work();
    } finally {
      this.hashing--;
    }
  }

  account(request: IncomingMessage): Account | null {
    return this.resolve(this.token(request));
  }

  /**
   * The session this request is carrying.
   *
   * Two ways in, one session table. A browser sends the HttpOnly cookie, which
   * is the right answer for a first-party page. A Telegram Mini App cannot:
   * on Telegram Desktop and Telegram Web it runs inside an iframe on somebody
   * else's origin, where neither a `Strict` nor a `Lax` cookie is sent — and
   * relaxing that to `None` only trades it for third-party cookie blocking.
   * So the Mini App presents the same token as a bearer credential instead.
   *
   * The bearer header is read first: a request that went to the trouble of
   * sending one means it, and a stale cookie in the same browser must not
   * quietly win.
   */
  token(request: IncomingMessage): string {
    const header = request.headers.authorization;
    if (typeof header === 'string' && header.length <= 128) {
      const match = /^Bearer ([a-f0-9]{64})$/.exec(header.trim());
      if (match) return match[1]!;
    }
    return (
      request.headers.cookie
        ?.split(';')
        .map((v) => v.trim())
        .find((v) => v.startsWith('battle_session='))
        ?.slice(15) ?? ''
    );
  }

  resolve(token: string): Account | null {
    if (!/^[a-f0-9]{64}$/.test(token)) return null;
    const row = this.db.sql
      .prepare(
        `SELECT a.id,a.username,a.onboarded FROM sessions s
      JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.expires_at>?`,
      )
      .get(digest(token), Date.now());
    return row
      ? { id: String(row.id), username: String(row.username), onboarded: row.onboarded === 1 }
      : null;
  }

  async register(input: z.infer<typeof registrationSchema>) {
    const password = await this.budget(() => hashPassword(input.password));
    const legacyId = this.identities?.verify(input.legacyIdentity) ?? null;
    const legacy = legacyId ? this.db.get(legacyId) : undefined;
    const id = legacy ? legacy.id : randomBytes(16).toString('hex');
    const recovery = randomBytes(24).toString('hex');
    return this.db.transaction(() => {
      if (this.db.sql.prepare('SELECT id FROM accounts WHERE username=?').get(input.username)) {
        throw new AuthError(409, 'That player ID is taken. Choose another.');
      }
      if (this.db.sql.prepare('SELECT id FROM accounts WHERE id=?').get(id)) {
        throw new AuthError(
          409,
          'This browser record is already linked to a player. Sign in to that player.',
        );
      }
      this.db.save({ ...(legacy ?? blankProfile(id, Date.now())), name: input.name });
      this.db.sql
        .prepare(
          'INSERT INTO accounts(id,username,password_hash,recovery_hash,created_at) VALUES(?,?,?,?,?)',
        )
        .run(id, input.username, password, digest(recovery), Date.now());
      return { token: this.session(id), recovery };
    });
  }

  async login(input: z.infer<typeof credentialsSchema>): Promise<string> {
    const row = this.db.sql
      .prepare(input.username.includes('@') ? 'SELECT id,password_hash FROM accounts WHERE email=? COLLATE NOCASE' : 'SELECT id,password_hash FROM accounts WHERE username=?')
      .get(input.username);
    // Same expensive work for unknown usernames; no quick account enumeration.
    const dummy = `${'0'.repeat(32)}:${'0'.repeat(128)}`;
    const valid = await this.budget(() =>
      verifyPassword(input.password, row ? String(row.password_hash) : dummy),
    );
    if (!row || !valid)
      throw new AuthError(401, 'Email, player ID or password does not match.');
    return this.session(String(row.id));
  }

  async recover(username: string, code: string, password: string): Promise<string> {
    const hash = await this.budget(() => hashPassword(password));
    return this.db.transaction(() => {
      const row = this.db.sql
        .prepare('SELECT id FROM accounts WHERE username=? AND recovery_hash=?')
        .get(username, digest(code));
      if (!row) throw new AuthError(401, 'Player ID or recovery code does not match.');
      const recovery = randomBytes(24).toString('hex');
      this.db.sql
        .prepare('UPDATE accounts SET password_hash=?,recovery_hash=? WHERE id=?')
        .run(hash, digest(recovery), row.id!);
      this.db.sql.prepare('DELETE FROM sessions WHERE account_id=?').run(row.id!);
      return recovery;
    });
  }

  session(id: string): string {
    const token = randomBytes(32).toString('hex');
    this.db.sql.prepare('DELETE FROM sessions WHERE expires_at<=?').run(Date.now());
    this.db.sql
      .prepare('INSERT INTO sessions VALUES(?,?,?)')
      .run(digest(token), id, Date.now() + SESSION_AGE);
    return token;
  }

  logout(request: IncomingMessage): void {
    this.db.sql.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(this.token(request)));
  }

  view(account: Account) {
    return {
      account: { username: account.username, onboarded: account.onboarded },
      profile: publicView(this.db.get(account.id)!, true),
      serverTime: Date.now(),
    };
  }
}

/**
 * The browser's half of a session.
 *
 * `Lax` rather than `Strict`, because of how signing in with Google ends: it is
 * Google that navigates the browser to our callback, and the callback sets this
 * cookie and redirects on to `/home`. A browser withholds a `Strict` cookie for
 * the whole of a navigation chain a third party began, so that final hop would
 * arrive with no session and drop the player on a logged-out page seconds after
 * they signed in. `Lax` rides a top-level GET navigation, which is precisely
 * what that hop is.
 *
 * Nothing is given up by the change. Mutations are POST-only and additionally
 * require the `x-battle-request` header and an `Origin` this server recognises,
 * so cross-site forgery is held off by those and never by SameSite, and no GET
 * route changes state.
 */
export function sessionCookie(token: string, secure: boolean): string {
  return `battle_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${token ? SESSION_AGE / 1000 : 0}${secure ? '; Secure' : ''}`;
}
