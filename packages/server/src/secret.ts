import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { log } from './log.js';

/**
 * The key that signs player identities, kept next to the ratings it protects.
 *
 * Generated once and reused, because a secret that changed on every restart
 * would invalidate every identity and hand everybody a fresh rating with it.
 * `IDENTITY_SECRET` overrides the file, which is what a deployment running
 * more than one process needs — they have to agree, or a token minted by one
 * is a forgery to the other.
 */
export function identitySecret(dir: string): Buffer {
  const fromEnv = process.env.IDENTITY_SECRET;
  if (fromEnv) {
    if (fromEnv.length < 32) throw new Error('IDENTITY_SECRET must be at least 32 characters.');
    return Buffer.from(fromEnv, 'utf8');
  }

  const path = join(dir, 'identity.key');
  try {
    const existing = readFileSync(path);
    if (existing.length >= 32) return existing;
  } catch {
    // Not there yet, which is the normal first run.
  }

  const fresh = randomBytes(32);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, fresh, { mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // Best effort: some filesystems do not carry permissions.
  }
  log.info('identity secret generated', { path });
  return fresh;
}
