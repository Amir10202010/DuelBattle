import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  INIT_DATA_MAX_AGE_MS,
  validateTelegramInitData,
} from '../src/telegram/initData.js';

const TOKEN = '7000000000:AAH-test-token-not-a-real-one_0123456789';

/** Signs a set of fields exactly as Telegram does, so the test signs like the source. */
function sign(fields: Record<string, string>, token = TOKEN): string {
  const check = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret).update(check).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

const USER = JSON.stringify({
  id: 4242,
  first_name: 'Amir',
  last_name: 'S',
  username: 'amir',
  language_code: 'ru',
  allows_write_to_pm: true,
  photo_url: 'https://t.me/i/userpic/320/amir.jpg',
});

function fresh(now: number, extra: Record<string, string> = {}) {
  return { auth_date: String(Math.floor(now / 1000)), user: USER, ...extra };
}

describe('validateTelegramInitData', () => {
  const now = 1_780_000_000_000;

  it('accepts data Telegram actually signed', () => {
    const result = validateTelegramInitData(sign(fresh(now)), TOKEN, now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.user.id).toBe(4242);
    expect(result.user.firstName).toBe('Amir');
    expect(result.user.username).toBe('amir');
    expect(result.user.languageCode).toBe('ru');
    expect(result.user.allowsWriteToPm).toBe(true);
    expect(result.user.photoUrl).toBe('https://t.me/i/userpic/320/amir.jpg');
  });

  it('reads the start parameter a deep link carries', () => {
    const result = validateTelegramInitData(
      sign(fresh(now, { start_param: 'ref_ABCD12' })),
      TOKEN,
      now,
    );
    expect(result.ok && result.startParam).toBe('ref_ABCD12');
  });

  it('rejects a forged hash', () => {
    const forged = sign(fresh(now)).replace(/hash=[a-f0-9]+/, `hash=${'0'.repeat(64)}`);
    expect(validateTelegramInitData(forged, TOKEN, now)).toEqual({ ok: false, reason: 'bad-hash' });
  });

  it('rejects a user id edited after signing', () => {
    const signed = sign(fresh(now));
    const params = new URLSearchParams(signed);
    params.set('user', JSON.stringify({ id: 1, first_name: 'Mallory' }));
    expect(validateTelegramInitData(params.toString(), TOKEN, now)).toEqual({
      ok: false,
      reason: 'bad-hash',
    });
  });

  it('rejects a field appended after signing', () => {
    expect(
      validateTelegramInitData(`${sign(fresh(now))}&chat_instance=9`, TOKEN, now),
    ).toEqual({ ok: false, reason: 'bad-hash' });
  });

  it('rejects data signed with a different bot token', () => {
    const other = sign(fresh(now), '7000000000:AAH-someone-elses-bot-token_98765432');
    expect(validateTelegramInitData(other, TOKEN, now)).toEqual({ ok: false, reason: 'bad-hash' });
  });

  it('rejects an authorisation older than the window', () => {
    const stale = sign(fresh(now - INIT_DATA_MAX_AGE_MS - 1_000));
    expect(validateTelegramInitData(stale, TOKEN, now)).toEqual({ ok: false, reason: 'expired' });
  });

  it('accepts an authorisation inside the window', () => {
    const recent = sign(fresh(now - INIT_DATA_MAX_AGE_MS + 60_000));
    expect(validateTelegramInitData(recent, TOKEN, now).ok).toBe(true);
  });

  it('rejects an authorisation dated in the future', () => {
    const ahead = sign(fresh(now + 10 * 60_000));
    expect(validateTelegramInitData(ahead, TOKEN, now)).toEqual({ ok: false, reason: 'expired' });
  });

  it('tolerates a small clock skew ahead of the server', () => {
    expect(validateTelegramInitData(sign(fresh(now + 20_000)), TOKEN, now).ok).toBe(true);
  });

  /*
   * The `signature` field, which every current client sends.
   *
   * Telegram's two validation methods are not symmetrical, and the difference
   * is the whole of this bug: the bot-token HMAC covers every field except
   * `hash`, so `signature` is part of it, while the third-party Ed25519 check
   * excludes both. Getting it backwards rejects every real launch while a test
   * that signs the string the same wrong way still passes — which is exactly
   * what happened, so both directions are asserted here.
   */
  it('accepts a launch whose hash covers the signature field', () => {
    const signed = sign({
      ...fresh(now),
      signature: 'PfQ2kx_ed25519_signature_from_telegram',
    });
    expect(validateTelegramInitData(signed, TOKEN, now).ok).toBe(true);
  });

  it('rejects a launch whose hash left the signature out', () => {
    // How Telegram would never build it, and how this code used to verify it.
    const fields: Record<string, string> = fresh(now);
    const check = Object.keys(fields)
      .sort()
      .map((key) => `${key}=${fields[key]}`)
      .join('\n');
    const secret = createHmac('sha256', 'WebAppData').update(TOKEN).digest();
    const hash = createHmac('sha256', secret).update(check).digest('hex');
    const wrong = new URLSearchParams({
      ...fields,
      signature: 'PfQ2kx_ed25519_signature_from_telegram',
      hash,
    }).toString();
    expect(validateTelegramInitData(wrong, TOKEN, now)).toEqual({
      ok: false,
      reason: 'bad-hash',
    });
  });

  it('still accepts a launch from a client old enough not to send one', () => {
    expect(validateTelegramInitData(sign(fresh(now)), TOKEN, now).ok).toBe(true);
  });

  it('refuses everything when the deployment has no bot token', () => {
    expect(validateTelegramInitData(sign(fresh(now)), '', now)).toEqual({
      ok: false,
      reason: 'not-configured',
    });
  });

  it('rejects an empty or malformed payload', () => {
    for (const bad of ['', 'nonsense', 'hash=abc', 'auth_date=1&hash=abc']) {
      expect(validateTelegramInitData(bad, TOKEN, now).ok).toBe(false);
    }
  });

  it('rejects data with no hash at all', () => {
    const params = new URLSearchParams(fresh(now));
    expect(validateTelegramInitData(params.toString(), TOKEN, now)).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it('rejects a user payload that is not an object with a numeric id', () => {
    for (const user of ['null', '[]', '{"first_name":"x"}', '{"id":"4242"}', 'not-json']) {
      const result = validateTelegramInitData(sign({ ...fresh(now), user }), TOKEN, now);
      expect(result).toEqual({ ok: false, reason: 'malformed' });
    }
  });

  it('rejects an oversized payload without hashing it', () => {
    const huge = `user=${'x'.repeat(8_000)}&hash=${'0'.repeat(64)}`;
    expect(validateTelegramInitData(huge, TOKEN, now)).toEqual({ ok: false, reason: 'malformed' });
  });

  it('ignores a photo url that is not https', () => {
    const user = JSON.stringify({ id: 7, first_name: 'A', photo_url: 'javascript:alert(1)' });
    const result = validateTelegramInitData(sign({ ...fresh(now), user }), TOKEN, now);
    expect(result.ok && result.user.photoUrl).toBe(null);
  });

  it('keeps names within the length the profile can store', () => {
    const user = JSON.stringify({ id: 8, first_name: 'A'.repeat(500), username: 'b'.repeat(500) });
    const result = validateTelegramInitData(sign({ ...fresh(now), user }), TOKEN, now);
    expect(result.ok && result.user.firstName.length).toBeLessThanOrEqual(64);
    expect(result.ok && result.user.username!.length).toBeLessThanOrEqual(32);
  });

  it('drops a start parameter that is not in Telegram\'s own alphabet', () => {
    const result = validateTelegramInitData(
      sign(fresh(now, { start_param: 'ref_<script>' })),
      TOKEN,
      now,
    );
    expect(result.ok && result.startParam).toBe(null);
  });

  it('is not fooled by a hash of a different case or length', () => {
    const signed = sign(fresh(now));
    const params = new URLSearchParams(signed);
    const hash = params.get('hash')!;
    params.set('hash', hash.toUpperCase());
    expect(validateTelegramInitData(params.toString(), TOKEN, now).ok).toBe(false);
    params.set('hash', hash.slice(0, 32));
    expect(validateTelegramInitData(params.toString(), TOKEN, now).ok).toBe(false);
  });
});
