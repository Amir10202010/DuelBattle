export type PlayMode = 'casual' | 'ranked';
const KEY = 'battle.mode.v1';

export function rememberedMode(): PlayMode {
  try {
    return localStorage.getItem(KEY) === 'ranked' ? 'ranked' : 'casual';
  } catch {
    return 'casual';
  }
}

export function rememberMode(mode: PlayMode): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* Matchmaking also works when browser storage is unavailable. */
  }
}
