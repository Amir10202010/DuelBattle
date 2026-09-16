import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose';
import { Database } from '../src/database.js';
import { AuthService } from '../src/auth.js';
import { AuthProviders, verifyGoogleIdentity } from '../src/authProviders.js';
let db: Database;
let auth: AuthService;
let provider: AuthProviders;
beforeEach(() => {
  vi.stubEnv('RESEND_API_KEY', '');
  vi.stubEnv('GOOGLE_CLIENT_ID', '');
  db = new Database(':memory:');
  auth = new AuthService(db);
  provider = new AuthProviders(auth);
});
afterEach(() => {
  db.close();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe('verified registration', () => {
  it('creates no account or session until a valid code is consumed, and refuses replay', async () => {
    const start = await provider.startEmail({ email: 'someone@example.test' });
    expect(db.sql.prepare('SELECT count(*) AS n FROM accounts').get()!.n).toBe(0);
    const input = {
      challenge: start.challenge,
      code: start.developmentCode,
      password: 'a-long-test-password',
      name: 'Player',
    };
    const token = await provider.verifyEmail(input);
    expect(auth.resolve(token)).not.toBeNull();
    await expect(provider.verifyEmail(input)).rejects.toThrow('expired');
    const login = await auth.login({ username: 'someone@example.test', password: input.password });
    expect(auth.resolve(login)?.id).toBe(auth.resolve(token)?.id);
  });
  it('expires codes and limits guesses and resends', async () => {
    const start = await provider.startEmail({ email: 'someone@example.test' });
    await expect(provider.startEmail({ email: 'someone@example.test' })).rejects.toThrow('minute');
    const input = {
      challenge: start.challenge,
      code: '000000',
      password: 'a-long-test-password',
      name: 'Player',
    };
    for (let i = 0; i < 5; i++) await expect(provider.verifyEmail(input)).rejects.toThrow();
    await expect(provider.verifyEmail({ ...input, code: start.developmentCode })).rejects.toThrow(
      'expired',
    );
    expect(db.sql.prepare('SELECT count(*) AS n FROM accounts').get()!.n).toBe(0);
  });
  it('requires a signed Google identity bound to this client and login attempt', async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: 'test' }] });
    const token = await new SignJWT({
      email: 'p@example.test',
      email_verified: true,
      nonce: 'this-login',
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test' })
      .setSubject('google-user')
      .setIssuer('https://accounts.google.com')
      .setAudience('our-app')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
    expect(await verifyGoogleIdentity(token, 'our-app', 'this-login', keys)).toMatchObject({
      sub: 'google-user',
    });
    await expect(verifyGoogleIdentity(token, 'other-app', 'this-login', keys)).rejects.toThrow();
    await expect(verifyGoogleIdentity(token, 'our-app', 'other-login', keys)).rejects.toThrow();
    const broken = `${token.slice(0, -20)}aaaaaaaaaaaaaaaaaaaa`;
    await expect(verifyGoogleIdentity(broken, 'our-app', 'this-login', keys)).rejects.toThrow();
  });
  it('resets a verified account, revokes old sessions and rejects weak passwords and expired codes', async () => {
    const start = await provider.startEmail({ email: 'player@example.test' });
    const input = {
      challenge: start.challenge,
      code: start.developmentCode,
      password: 'first-password-long',
      name: 'Player',
    };
    await expect(provider.verifyEmail({ ...input, password: 'short' })).rejects.toThrow();
    const oldToken = await provider.verifyEmail(input);
    const id = auth.resolve(oldToken)!.id;
    const oldRecovery = db.sql
      .prepare('SELECT recovery_hash FROM accounts WHERE id=?')
      .get(id)!.recovery_hash;
    const reset = await provider.startEmail({ email: 'player@example.test', purpose: 'reset' });
    const newToken = await provider.verifyEmail({
      ...input,
      challenge: reset.challenge,
      code: reset.developmentCode,
      password: 'second-password-long',
    });
    expect(auth.resolve(oldToken)).toBeNull();
    expect(auth.resolve(newToken)!.id).toBe(id);
    expect(
      db.sql.prepare('SELECT recovery_hash FROM accounts WHERE id=?').get(id)!.recovery_hash,
    ).not.toBe(oldRecovery);
    await expect(
      auth.login({ username: 'player@example.test', password: input.password }),
    ).rejects.toThrow();
    const expired = await provider.startEmail({ email: 'another@example.test' });
    db.sql.prepare('UPDATE email_challenges SET expires_at=0').run();
    await expect(
      provider.verifyEmail({
        ...input,
        challenge: expired.challenge,
        code: expired.developmentCode,
      }),
    ).rejects.toThrow('expired');
  });
  it('does not expose email codes when delivery is configured and cleans up failed sends', async () => {
    vi.stubEnv('RESEND_API_KEY', 'test-only-mail-key');
    vi.stubEnv('MAIL_FROM', 'Game <test@example.test>');
    provider = new AuthProviders(auth);
    const send = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', send);
    expect(await provider.startEmail({ email: 'player@example.test' })).not.toHaveProperty(
      'developmentCode',
    );
    expect(send).toHaveBeenCalledOnce();
    send.mockResolvedValue({ ok: false });
    await expect(provider.startEmail({ email: 'failed@example.test' })).rejects.toThrow(
      'could not send',
    );
    expect(
      db.sql
        .prepare("SELECT count(*) AS n FROM email_challenges WHERE email='failed@example.test'")
        .get()!.n,
    ).toBe(0);
  });
});
