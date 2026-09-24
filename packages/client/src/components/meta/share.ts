import { tr } from '../../i18n/index.js';
import { track } from '../../analytics.js';

export interface ShareResult {
  you: string;
  them: string;
  yourScore: number;
  theirScore: number;
  won: boolean;
  ranked: boolean;
}

/**
 * Draws the result as a card worth posting: the score huge, both names, and
 * the game's name where a friend will see it. Canvas rather than a screenshot
 * of the page, because the page has a live camera on it and a card must never
 * carry anybody's room.
 */
function drawCard(result: ShareResult): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, 1080, 1080);
  gradient.addColorStop(0, '#13170e');
  gradient.addColorStop(1, result.won ? '#2f4a12' : '#3a2016');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1080, 1080);
  ctx.strokeStyle = 'rgba(213,248,97,0.18)';
  ctx.lineWidth = 2;
  for (let i = -1080; i < 1080; i += 60) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 1080, 1080);
    ctx.stroke();
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = '#d5f861';
  ctx.font = '800 64px Onest Variable, system-ui, sans-serif';
  ctx.fillText('DUELBATTLE', 540, 150);
  ctx.fillStyle = '#f2f3e8';
  ctx.font = '800 120px Onest Variable, system-ui, sans-serif';
  ctx.fillText(tr(result.won ? 'VICTORY' : 'GOOD GAME'), 540, 330);
  ctx.font = '900 300px Onest Variable, system-ui, sans-serif';
  ctx.fillStyle = result.won ? '#d5f861' : '#ff9068';
  ctx.fillText(`${result.yourScore}–${result.theirScore}`, 540, 640);
  ctx.fillStyle = '#f2f3e8';
  ctx.font = '700 56px Onest Variable, system-ui, sans-serif';
  ctx.fillText(`${result.you}  vs  ${result.them}`, 540, 760);
  ctx.fillStyle = '#a9b099';
  ctx.font = '500 40px Onest Variable, system-ui, sans-serif';
  ctx.fillText(tr(result.ranked ? 'Ranked duel' : 'Quick play'), 540, 830);
  ctx.fillStyle = '#d5f861';
  ctx.font = '700 44px Onest Variable, system-ui, sans-serif';
  ctx.fillText(tr('Your room is the game. Beat me.'), 540, 960);
  return canvas;
}

/**
 * Shares a result the best way this device allows: the native share sheet with
 * the card attached, the share sheet with a link, or — on a desktop that has
 * neither — the card downloaded and the link copied.
 */
export async function shareResult(result: ShareResult): Promise<'shared' | 'copied' | 'cancelled'> {
  const url = `${location.origin}/`;
  const text = tr(
    result.won
      ? `I won ${result.yourScore}–${result.theirScore} in DuelBattle. Think you can find it faster?`
      : `${result.yourScore}–${result.theirScore} in DuelBattle. Rematch me.`,
  );
  track('share_pressed', { won: result.won, ranked: result.ranked });
  const canvas = drawCard(result);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  const file = blob ? new File([blob], 'duelbattle-result.png', { type: 'image/png' }) : null;
  try {
    if (file && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text, url });
      return 'shared';
    }
    if (navigator.share) {
      await navigator.share({ text, url });
      return 'shared';
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
  }
  if (blob) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'duelbattle-result.png';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 5_000);
  }
  try {
    await navigator.clipboard?.writeText(`${text} ${url}`);
  } catch {
    /* The card still downloaded; the link is a bonus. */
  }
  return 'copied';
}
