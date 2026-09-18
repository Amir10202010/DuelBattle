import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Arrows, boxes and dingbats typed as characters.
 *
 * A glyph like U+2197 is at the mercy of whatever face the fallback stack lands
 * on, and a font that declares the range but ships no glyph renders it as an
 * empty box — in the accent colour, at headline size, that is a hollow yellow
 * square sitting in the middle of the hero. It cost a round trip to diagnose
 * once because the machine that reports it and the machine that renders it have
 * different fonts installed, so it reproduces for one person and nobody else.
 *
 * Ordinary punctuation is fine: the middle dot, em dash, ellipsis and curly
 * quotes live in ranges every text font covers. This only guards the ranges
 * that are decoration pretending to be text — draw those instead, with an inline
 * SVG or an icon, where the shape is ours and cannot go missing.
 */
const DECORATIVE = /[←-⇿⌀-⏿■-◿☀-➿⤀-⥿⬀-⯿]/u;

const ROOTS = [
  'packages/client/src',
  'packages/shared/src',
];

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.(ts|tsx|css)$/.test(entry.name) ? [path] : [];
  });
}

describe('text that has to render everywhere', () => {
  it('draws arrows and symbols rather than typing them', () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of sources(root)) {
        readFileSync(file, 'utf8')
          .split('\n')
          .forEach((line, index) => {
            const found = DECORATIVE.exec(line);
            if (!found) return;
            const point = found[0].codePointAt(0)!.toString(16).toUpperCase();
            offenders.push(`${file}:${index + 1} U+${point} ${found[0]}`);
          });
      }
    }
    expect(offenders).toEqual([]);
  });
});
