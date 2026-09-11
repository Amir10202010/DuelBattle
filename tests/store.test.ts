import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Store } from '../server/store';
import { mkdtempSync, readdirSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('durable identity, entitlements and atomic usage', () => {
  let store: Store;
  const now = Date.parse('2026-09-10T12:00:00Z');
  beforeEach(() => (store = new Store(':memory:')));
  afterEach(() => store.close());
  it('stores hashed session secrets, expires them, and does not accept arbitrary tokens', () => {
    const { token, session } = store.createSession(now);
    expect(store.session(token, now)?.id).toBe(session.id);
    expect(store.session(token, now + 31 * 86_400_000)).toBeUndefined();
    expect(store.session('forged', now)).toBeUndefined();
    const row = store.db.prepare('SELECT token_hash FROM sessions').get()!;
    expect(row.token_hash).not.toBe(token);
  });
  it('enforces three free starts per UTC day and resets across midnight', () => {
    const { session } = store.createSession(now);
    for (let i = 0; i < 3; i++) store.consumeBattle([session.id], now);
    expect(store.profile(session, now).remaining).toBe(0);
    expect(() => store.consumeBattle([session.id], now)).toThrow('free battle limit');
    const tomorrow = Date.parse('2026-09-11T00:00:00Z');
    expect(store.profile(session, tomorrow).remaining).toBe(3);
    store.consumeBattle([session.id], tomorrow);
    expect(store.profile(session, tomorrow).remaining).toBe(2);
  });
  it('charges neither participant when one is out of battles', () => {
    const a = store.createSession(now).session,
      b = store.createSession(now).session;
    for (let i = 0; i < 3; i++) store.consumeBattle([b.id], now);
    expect(() => store.consumeBattle([a.id, b.id], now)).toThrow();
    expect(store.profile(a, now).remaining).toBe(3);
  });
  it('premium is server owned, expires, and is rate limited without a daily cap', () => {
    const s = store.createSession(now).session;
    expect(store.getPlan(s.id, now)).toBe('free');
    store.grantPremium(s.id, now + 2 * 86_400_000);
    expect(store.getPlan(s.id, now)).toBe('premium');
    expect(store.profile(s, now).remaining).toBeNull();
    store.consumeBattle([s.id], now);
    expect(() => store.consumeBattle([s.id], now + 3_599_999)).toThrow('one hour');
    for (let i = 1; i < 8; i++) store.consumeBattle([s.id], now + i * 3_600_000);
    expect(store.profile(s, now + 8 * 3_600_000).remaining).toBeNull();
    expect(store.getPlan(s.id, now + 3 * 86_400_000)).toBe('free');
  });
  it('premium hourly limit also applies across a UTC day boundary', () => {
    const s = store.createSession(now).session;
    store.grantPremium(s.id, now + 2 * 86_400_000);
    store.consumeBattle([s.id], Date.parse('2026-09-10T23:50:00Z'));
    expect(() => store.consumeBattle([s.id], Date.parse('2026-09-11T00:10:00Z'))).toThrow(
      'one hour',
    );
  });
  it('deduplicates participant charges and uses foreign keys', () => {
    const s = store.createSession(now).session;
    store.consumeBattle([s.id, s.id], now);
    expect(store.profile(s, now).remaining).toBe(2);
    expect(() => store.grantPremium('fake', now + 1000)).toThrow();
  });
  it('keeps identity, usage and subscriptions through a process-style database reopen', () => {
    const directory = mkdtempSync(join(tmpdir(), 'duelbattle-store-test-'));
    const path = join(directory, 'test.sqlite');
    let persistent = new Store(path);
    try {
      const { token, session } = persistent.createSession(now);
      persistent.consumeBattle([session.id], now);
      persistent.grantPremium(session.id, now + 86_400_000);
      persistent.close();
      persistent = new Store(path);
      expect(persistent.session(token, now)?.id).toBe(session.id);
      expect(persistent.getPlan(session.id, now)).toBe('premium');
      expect(persistent.profile(session, now).nextBattleAt).toBe(now + 3_600_000);
      expect(persistent.db.prepare('SELECT count FROM usage').get()?.count).toBe(1);
    } finally {
      persistent.close();
      for (const file of readdirSync(directory)) unlinkSync(join(directory, file));
      rmdirSync(directory);
    }
  });
});
