import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Signed guest identity for room continuity and claiming a legacy profile.
 * Account sessions and ranked authorization are handled separately by AuthService. */
export class Identities {
  constructor(private readonly secret: Buffer) {
    if (secret.length < 16) throw new Error('Identity secret must be at least 16 bytes.');
  }

  /** A fresh identity, as `id.signature`. */
  issue(): string {
    const id = randomBytes(12).toString('base64url');
    return `${id}.${this.sign(id)}`;
  }

  /** The id inside a token, or null if it was not minted here. */
  verify(token: unknown): string | null {
    if (typeof token !== 'string' || token.length > 128) return null;
    const cut = token.lastIndexOf('.');
    if (cut <= 0) return null;

    const id = token.slice(0, cut);
    const signature = token.slice(cut + 1);
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;

    const expected = Buffer.from(this.sign(id));
    const given = Buffer.from(signature);
    // Length first: timingSafeEqual throws rather than returning false on a
    // mismatch, and the length of a signature is not a secret.
    if (expected.length !== given.length) return null;
    return timingSafeEqual(expected, given) ? id : null;
  }

  private sign(id: string): string {
    return createHmac('sha256', this.secret).update(id).digest('base64url');
  }
}
