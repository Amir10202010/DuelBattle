export const ROOM_CODE_PATTERN = /^[A-F0-9]{10}$/;
export const PLAYER_NAME_PATTERN = /^[\p{L}\p{N} _.-]+$/u;

/** The same rules drive browser feedback and the strict server schemas. */
export function parsePlayerName(input: string) {
  const data = input.trim();
  return { success: data.length >= 1 && data.length <= 20 && PLAYER_NAME_PATTERN.test(data), data };
}

export function extractRoomCode(input: string): string | null {
  const text = input.trim();
  let candidate = text;
  if (/^https?:\/\//i.test(text) || text.startsWith('/')) {
    try {
      const url = new URL(text, 'https://battle.invalid');
      const match = /^\/battle\/([a-f0-9]{10})\/?$/i.exec(url.pathname);
      if (!match) return null;
      candidate = match[1];
    } catch {
      return null;
    }
  }
  candidate = candidate.toUpperCase();
  return ROOM_CODE_PATTERN.test(candidate) ? candidate : null;
}
