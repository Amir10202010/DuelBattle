import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Database } from '../src/database.js';
import { AuthService } from '../src/auth.js';
import { AuthProviders, senderOf } from '../src/authProviders.js';

let db: Database;

/** Env is read when the provider is constructed, so it has to be set first. */
function withMail(vars: Record<string, string>): AuthProviders {
  for (const [key, value] of Object.entries(vars)) vi.stubEnv(key, value);
  return new AuthProviders(new AuthService(db));
}

function captureFetch(ok = true) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(new Response(ok ? '{}' : 'nope', { status: ok ? 201 : 422 }));
  });
  return calls;
}

const body = (init: RequestInit) => JSON.parse(String(init.body)) as Record<string, unknown>;
const headers = (init: RequestInit) => init.headers as Record<string, string>;

beforeEach(() => {
  vi.stubEnv('RESEND_API_KEY', '');
  vi.stubEnv('BREVO_API_KEY', '');
  vi.stubEnv('MAIL_FROM', '');
  vi.stubEnv('GOOGLE_CLIENT_ID', '');
  db = new Database(':memory:');
});

afterEach(() => {
  db.close();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('reading MAIL_FROM', () => {
  it('splits a mail header into a name and an address', () => {
    expect(senderOf('DuelBattle <play@example.test>')).toEqual({
      name: 'DuelBattle',
      email: 'play@example.test',
    });
  });

  it('accepts a bare address, which is what somebody without a domain will type', () => {
    expect(senderOf('me@gmail.test')).toEqual({ name: 'DuelBattle', email: 'me@gmail.test' });
    expect(senderOf('  me@gmail.test  ')).toEqual({ name: 'DuelBattle', email: 'me@gmail.test' });
  });

  it('never leaves the name empty', () => {
    expect(senderOf('<play@example.test>').name).toBe('DuelBattle');
  });
});

describe('sending the code', () => {
  it('posts to Brevo with the sender split apart, when that is what is configured', async () => {
    const provider = withMail({ BREVO_API_KEY: 'xkeysib-test', MAIL_FROM: 'Duel <me@gmail.test>' });
    const calls = captureFetch();

    const start = await provider.startEmail({ email: 'player@example.test' });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(headers(calls[0]!.init)['api-key']).toBe('xkeysib-test');
    expect(body(calls[0]!.init)).toMatchObject({
      sender: { name: 'Duel', email: 'me@gmail.test' },
      to: [{ email: 'player@example.test' }],
    });
    // The code goes in the message and never comes back to the caller once a
    // service is carrying it.
    expect(String(body(calls[0]!.init).textContent)).toMatch(/\d{6}/);
    expect(start).not.toHaveProperty('developmentCode');
  });

  it('prefers Resend when a verified domain is configured too', async () => {
    const provider = withMail({
      RESEND_API_KEY: 're-test',
      BREVO_API_KEY: 'xkeysib-test',
      MAIL_FROM: 'Duel <play@example.test>',
    });
    const calls = captureFetch();

    await provider.startEmail({ email: 'player@example.test' });

    expect(calls[0]!.url).toBe('https://api.resend.com/emails');
    expect(headers(calls[0]!.init).authorization).toBe('Bearer re-test');
  });

  it('sends nothing and hands back the code when no service is configured', async () => {
    const provider = withMail({});
    const calls = captureFetch();

    const start = await provider.startEmail({ email: 'player@example.test' });

    expect(calls).toHaveLength(0);
    expect(start.developmentCode).toMatch(/^\d{6}$/);
  });

  it('needs a sender address, not just a key', async () => {
    const provider = withMail({ BREVO_API_KEY: 'xkeysib-test' });
    const calls = captureFetch();

    await provider.startEmail({ email: 'player@example.test' });

    expect(calls).toHaveLength(0);
  });

  /**
   * A provider that starts refusing — a rotated key, an unverified sender, a
   * quota — breaks every registration at once, and the player is told only
   * "try again shortly". If the server says nothing either, the first anyone
   * hears of it is a support message, so the reason goes in the log.
   */
  it('records why delivery failed, without putting anything private in the log', async () => {
    const { log } = await import('../src/log.js');
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => {});
    const provider = withMail({ BREVO_API_KEY: 'xkeysib-secret', MAIL_FROM: 'me@gmail.test' });
    captureFetch(false);

    await expect(provider.startEmail({ email: 'player@example.test' })).rejects.toThrow();

    expect(warn).toHaveBeenCalledWith('verification email failed', {
      provider: 'brevo',
      status: 422,
    });
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain('xkeysib-secret');
    expect(logged).not.toContain('player@example.test');
  });

  it('drops the challenge when delivery fails, so the next attempt is not refused', async () => {
    const provider = withMail({ BREVO_API_KEY: 'xkeysib-test', MAIL_FROM: 'me@gmail.test' });
    captureFetch(false);

    await expect(provider.startEmail({ email: 'player@example.test' })).rejects.toThrow();
    // A row left behind would trip the one-a-minute guard on a code that was
    // never delivered, locking somebody out of their own registration.
    expect(db.sql.prepare('SELECT count(*) AS n FROM email_challenges').get()!.n).toBe(0);
  });
});
