/**
 * Identifier helpers.
 *
 * Room codes use Crockford Base32: the alphabet excludes I, L, O and U, which
 * removes the look-alike pairs that break codes read aloud or typed from a
 * photo, and it comes with a documented normalization (I/L -> 1, O -> 0) so we
 * are not inventing our own guesswork mapping.
 */
export const ROOM_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const ROOM_CODE_LENGTH = 5;

const ROOM_CODE_RE = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

export type RandomSource = () => number;

const defaultRandom: RandomSource = () => Math.random();

function pick(alphabet: string, random: RandomSource): string {
  const idx = Math.min(alphabet.length - 1, Math.floor(random() * alphabet.length));
  return alphabet[idx] ?? alphabet[0]!;
}

export function generateRoomCode(random: RandomSource = defaultRandom): string {
  let out = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) out += pick(ROOM_CODE_ALPHABET, random);
  return out;
}

/**
 * Folds user input onto the canonical alphabet: upper-cases, drops separators
 * (spaces, dashes) and applies the Crockford substitutions.
 *
 * Deliberately does not truncate. A code of the wrong length is wrong, and
 * trimming it would quietly turn a mistyped link into a valid one for somebody
 * else's room.
 */
export function normalizeRoomCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0')
    .replace(/U/g, 'V');
}

/**
 * Pulls a room code out of whatever the player has to hand: the code itself, or
 * a full invite link they pasted. Returns null unless the result is a code that
 * could actually exist.
 */
export function extractRoomCode(input: string): string | null {
  const fromLink = /\/r\/([^/?#\s]+)/i.exec(input);
  const candidate = normalizeRoomCode(fromLink?.[1] ?? input);
  return isValidRoomCode(candidate) ? candidate : null;
}

export function isValidRoomCode(code: string): boolean {
  return ROOM_CODE_RE.test(code);
}

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function randomId(length = 12, random: RandomSource = defaultRandom): string {
  let out = '';
  for (let i = 0; i < length; i++) out += pick(ID_ALPHABET, random);
  return out;
}
