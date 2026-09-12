import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Who a returning player is, without asking them to sign up for anything.
 *
 * The browser keeps a token; the server issues it and is the only thing that
 * can mint a valid one. There is no email, no password and nothing to
 * remember — but there is a signature, because without one "I am player X" is
 * a claim anybody can make, and a rating you can take off somebody by typing
 * their id is not a rating.
 *
 * A token is a bearer credential for a rating and nothing else. It unlocks no
 * personal data, because there is none: a row here is a number, a display name
 * and a handful of counters.
 */
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
