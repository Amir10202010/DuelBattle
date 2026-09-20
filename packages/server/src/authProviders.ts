import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { z } from 'zod';
import { nameSchema } from '@battle/shared/validation';
import { AuthError, hashPassword, sessionCookie, type AuthService } from './auth.js';
import { blankProfile } from './profiles.js';
import { config } from './config.js';
import { log } from './log.js';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const emailSchema = z.string().trim().toLowerCase().email().max(254);
const startSchema = z
  .object({ email: emailSchema, purpose: z.enum(['register', 'reset']).default('register') })
  .strict();
const verifySchema = z
  .object({
    challenge: z.string().regex(/^[a-f0-9]{48}$/),
    code: z.string().regex(/^\d{6}$/),
    password: z.string().min(12).max(128),
    name: nameSchema,
  })
  .strict();
const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'), {
  timeoutDuration: 5000,
});

export async function verifyGoogleIdentity(
  token: string,
  audience: string,
  nonce: string,
  keys: JWTVerifyGetKey = googleKeys,
) {
  const { payload } = await jwtVerify(token, keys, {
    audience,
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    algorithms: ['RS256'],
    requiredClaims: ['exp', 'iat', 'sub', 'nonce'],
  });
  if (payload.nonce !== nonce || payload.email_verified !== true || !payload.sub)
    throw new Error('Unverified identity');
  return {
    sub: payload.sub,
    email: emailSchema.parse(payload.email),
    name: typeof payload.name === 'string' ? payload.name : 'Player',
  };
}

/**
 * `MAIL_FROM` as a name and an address.
 *
 * It is written the way a mail header is — `DuelBattle <play@example.com>` —
 * because that is what one service wants and what a person expects to type.
 * The other wants the two halves separately, so they are split here rather than
 * asking anybody to configure the same thing twice in two shapes.
 */
export function senderOf(from: string): { name: string; email: string } {
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from);
  if (match) return { name: match[1] || 'DuelBattle', email: match[2]!.trim() };
  return { name: 'DuelBattle', email: from.trim() };
}

export class AuthProviders {
  private hashing = 0;
  private readonly origin =
    process.env.APP_ORIGIN || (config.nodeEnv !== 'production' ? 'http://localhost:5173' : '');
  private readonly googleId = process.env.GOOGLE_CLIENT_ID || '';
  private readonly googleSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  private readonly resendKey = process.env.RESEND_API_KEY || '';
  private readonly brevoKey = process.env.BREVO_API_KEY || '';
  private readonly mailFrom = process.env.MAIL_FROM || '';
  constructor(private readonly auth: AuthService) {}

  /**
   * Which service carries the code, if any.
   *
   * Two, because the choice is not about features — it is about whether you own
   * a domain. Resend will only send to strangers from a domain you have proved
   * with DNS records, which is the right answer once there is a real address to
   * send from and no answer at all while the game lives on somebody else's
   * subdomain. Brevo verifies a single sender address instead, so a project
   * with no domain can still put a code in somebody's inbox.
   *
   * Resend first when both are set: a configured domain is the stronger signal.
   */
  private get mailer(): 'resend' | 'brevo' | null {
    if (!this.mailFrom) return null;
    if (this.resendKey) return 'resend';
    return this.brevoKey ? 'brevo' : null;
  }

  /**
   * Why Google sign-in is off, or `null` when it is on.
   *
   * The same answer the button and the callback both read, phrased as the
   * thing an operator has to go and fix. Silence here is what this cost us
   * once already: a server holding none of these values serves a dead button
   * and bounces every callback back to the login page, which from the outside
   * looks exactly like a sign-in that quietly refuses to work.
   */
  googleGap(): string | null {
    if (!this.googleId || !this.googleSecret)
      return 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not both set';
    if (
      !/^https:\/\/[^/]+$/.test(this.origin) &&
      !(config.nodeEnv !== 'production' && /^http:\/\/localhost:\d+$/.test(this.origin))
    )
      return `APP_ORIGIN is ${this.origin ? `'${this.origin}'` : 'unset'}, which is not a usable origin`;
    return null;
  }

  options() {
    return {
      google: this.googleGap() === null,
      email: this.mailer !== null || config.nodeEnv !== 'production',
    };
  }

  async startEmail(input: unknown) {
    if (!this.options().email) throw new AuthError(503, 'Email sign-in is not configured yet.');
    const { email, purpose } = startSchema.parse(input);
    const now = Date.now();
    const sql = this.auth.db.sql;
    sql.prepare('DELETE FROM email_challenges WHERE expires_at<?').run(now);
    const recent = sql
      .prepare('SELECT count(*) AS n FROM email_challenges WHERE email=? AND created_at>?')
      .get(email, now - 60000)!;
    if (Number(recent.n)) throw new AuthError(429, 'Wait a minute before requesting another code.');
    const challenge = randomBytes(24).toString('hex');
    const code = String(randomInt(100000, 1000000));
    sql
      .prepare('INSERT INTO email_challenges VALUES(?,?,?,?,0,?,?)')
      .run(digest(challenge), email, digest(`${challenge}:${code}`), purpose, now + 600000, now);
    try {
      await this.deliver(email, code, challenge);
    } catch {
      sql.prepare('DELETE FROM email_challenges WHERE id=?').run(digest(challenge));
      throw new AuthError(503, 'We could not send the code. Try again shortly.');
    }
    return {
      challenge,
      ...(this.mailer === null && config.nodeEnv !== 'production'
        ? { developmentCode: code }
        : {}),
    };
  }

  /**
   * The one message this game ever sends.
   *
   * Plain text in both languages, because a six-digit code needs no layout and
   * a plain-text message is the one thing no spam filter objects to. With no
   * service configured this does nothing at all: in development the code comes
   * back in the response and is shown in the form.
   */
  private async deliver(email: string, code: string, challenge: string): Promise<void> {
    const subject = 'DuelBattle — verification code';
    const text =
      `Your DuelBattle code: ${code}\nКод для DuelBattle: ${code}\n\n` +
      'Valid for 10 minutes. If you did not request this, ignore this email.';

    const request: { url: string; headers: Record<string, string>; body: unknown } | null =
      this.mailer === 'resend'
        ? {
            url: 'https://api.resend.com/emails',
            headers: {
              authorization: `Bearer ${this.resendKey}`,
              'content-type': 'application/json',
              // Resend de-duplicates on this, so a retried request cannot send
              // the same code twice.
              'idempotency-key': challenge,
            },
            body: { from: this.mailFrom, to: [email], subject, text },
          }
        : this.mailer === 'brevo'
          ? {
              url: 'https://api.brevo.com/v3/smtp/email',
              headers: {
                'api-key': this.brevoKey,
                'content-type': 'application/json',
                accept: 'application/json',
              },
              // Brevo wants the sender split apart rather than as one header line.
              body: { sender: senderOf(this.mailFrom), to: [{ email }], subject, textContent: text },
            }
          : null;
    if (!request) return;

    const response = await fetch(request.url, {
      method: 'POST',
      signal: AbortSignal.timeout(8000),
      headers: request.headers,
      body: JSON.stringify(request.body),
    });
    if (!response.ok) throw new Error('Email delivery failed');
  }

  async verifyEmail(input: unknown) {
    const data = verifySchema.parse(input);
    const sql = this.auth.db.sql;
    const key = digest(data.challenge);
    const row = sql
      .prepare('SELECT * FROM email_challenges WHERE id=? AND expires_at>? AND attempts<5')
      .get(key, Date.now());
    if (!row) throw new AuthError(400, 'Code expired. Request a new one.');
    sql.prepare('UPDATE email_challenges SET attempts=attempts+1 WHERE id=?').run(key);
    if (
      !timingSafeEqual(
        Buffer.from(digest(`${data.challenge}:${data.code}`)),
        Buffer.from(String(row.code_hash)),
      )
    )
      throw new AuthError(400, 'That code does not match.');
    if (this.hashing >= 2) throw new AuthError(429, 'Sign-in is busy. Try again in a moment.');
    this.hashing++;
    let password: string;
    try {
      password = await hashPassword(data.password);
    } finally {
      this.hashing--;
    }
    return this.auth.db.transaction(() => {
      if (
        !sql
          .prepare('DELETE FROM email_challenges WHERE id=? AND expires_at>?')
          .run(key, Date.now()).changes
      )
        throw new AuthError(400, 'Code expired. Request a new one.');
      const existing = sql
        .prepare('SELECT id FROM accounts WHERE email=? COLLATE NOCASE')
        .get(row.email!);
      if (existing && row.purpose !== 'reset')
        throw new AuthError(409, 'This email already has an account. Sign in.');
      if (!existing && row.purpose === 'reset')
        throw new AuthError(400, 'Create an account with this email first.');
      const id = existing
        ? String(existing.id)
        : this.createAccount(String(row.email), data.name, password);
      if (existing) {
        sql
          .prepare('UPDATE accounts SET password_hash=?,recovery_hash=? WHERE id=?')
          .run(password, digest(randomBytes(32).toString('hex')), id);
        sql.prepare('DELETE FROM sessions WHERE account_id=?').run(id);
      }
      sql.prepare('DELETE FROM email_challenges WHERE email=?').run(row.email!);
      return this.auth.session(id);
    });
  }

  private createAccount(email: string, name: string, password: string, sub?: string) {
    const id = randomBytes(16).toString('hex');
    this.auth.db.save({ ...blankProfile(id, Date.now()), name });
    this.auth.db.sql
      .prepare(
        'INSERT INTO accounts(id,username,password_hash,recovery_hash,created_at,email,google_sub) VALUES(?,?,?,?,?,?,?)',
      )
      .run(
        id,
        `p_${id.slice(0, 18)}`,
        password,
        digest(randomBytes(32).toString('hex')),
        Date.now(),
        email,
        sub ?? null,
      );
    return id;
  }

  googleStart(res: ServerResponse) {
    if (!this.options().google) throw new AuthError(503, 'Google sign-in is not configured yet.');
    const state = randomBytes(32).toString('hex');
    const nonce = randomBytes(24).toString('hex');
    const verifier = randomBytes(48).toString('base64url');
    this.auth.db.sql.prepare('DELETE FROM oauth_challenges WHERE expires_at<?').run(Date.now());
    this.auth.db.sql
      .prepare('INSERT INTO oauth_challenges VALUES(?,?,?,?)')
      .run(digest(state), nonce, verifier, Date.now() + 600000);
    res.setHeader('set-cookie', this.googleCookie(state));
    const params = new URLSearchParams({
      client_id: this.googleId,
      redirect_uri: `${this.origin}/api/auth/google/callback`,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      nonce,
      code_challenge_method: 'S256',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      prompt: 'select_account',
    });
    res.writeHead(302, {
      location: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
      'cache-control': 'no-store',
    });
    res.end();
  }

  private googleCookie(state: string) {
    return `battle_oauth=${state}; HttpOnly; SameSite=Lax; Path=/api/auth/google; Max-Age=${state ? 600 : 0}${config.nodeEnv === 'production' ? '; Secure' : ''}`;
  }

  async googleCallback(req: IncomingMessage, res: ServerResponse) {
    const params = new URL(req.url!, 'http://localhost').searchParams;
    const state = params.get('state') ?? '';
    const cookie = req.headers.cookie
      ?.split(';')
      .map((v) => v.trim())
      .find((v) => v.startsWith('battle_oauth='))
      ?.slice(13);
    try {
      if (!this.options().google || !/^[a-f0-9]{64}$/.test(state) || state !== cookie)
        throw new Error('Invalid OAuth state');
      const saved = this.auth.db.sql
        .prepare('DELETE FROM oauth_challenges WHERE state_hash=? AND expires_at>? RETURNING *')
        .get(digest(state), Date.now());
      if (!saved || !params.get('code') || params.has('error'))
        throw new Error('Invalid OAuth callback');
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        signal: AbortSignal.timeout(8000),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: params.get('code')!,
          client_id: this.googleId,
          client_secret: this.googleSecret,
          redirect_uri: `${this.origin}/api/auth/google/callback`,
          grant_type: 'authorization_code',
          code_verifier: String(saved.verifier),
        }),
      });
      if (!response.ok) throw new Error('Token exchange failed');
      const tokens = z.object({ id_token: z.string().max(16000) }).parse(await response.json());
      const payload = await verifyGoogleIdentity(
        tokens.id_token,
        this.googleId,
        String(saved.nonce),
      );
      const email = payload.email;
      const safeName = nameSchema.safeParse(payload.name.slice(0, 18));
      const token = this.auth.db.transaction(() => {
        const existing = this.auth.db.sql
          .prepare('SELECT id FROM accounts WHERE google_sub=?')
          .get(payload.sub!);
        if (
          !existing &&
          this.auth.db.sql
            .prepare('SELECT id FROM accounts WHERE email=? COLLATE NOCASE')
            .get(email)
        )
          throw new AuthError(409, 'Use email sign-in for this account.');
        const id = existing
          ? String(existing.id)
          : this.createAccount(
              email,
              safeName.success ? safeName.data : 'Player',
              'external',
              payload.sub,
            );
        return this.auth.session(id);
      });
      res.setHeader('set-cookie', [
        sessionCookie(token, config.nodeEnv === 'production'),
        this.googleCookie(''),
      ]);
      res.writeHead(303, { location: '/home', 'cache-control': 'no-store' });
    } catch (error) {
      // The player only ever gets the login page back, because nothing here
      // is their doing and the detail is no help to them. The operator gets
      // the reason, which is the difference between a five-minute fix and a
      // bug report that says only 'Google does not work'.
      log.warn('google sign-in failed', {
        reason: this.googleGap() ?? (error instanceof Error ? error.message : 'unknown'),
      });
      res.setHeader('set-cookie', this.googleCookie(''));
      res.writeHead(303, { location: '/login?auth_error=google', 'cache-control': 'no-store' });
    }
    res.end();
  }
}
