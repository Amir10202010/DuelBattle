import { memo } from 'react';
import { tr } from '../i18n/index.js';
import { BODY_LINKS, HAND_LINKS, visible, nearHand, type Box, type Point, type Scene } from '../vision/types.js';

function Skeleton({ points, links }: { points: Point[]; links: readonly (readonly [number, number])[] }) {
  return <g>{links.map(([a, b]) => visible(points[a]) && visible(points[b]) ?
    <line key={`${a}-${b}`} x1={points[a]!.x * 320} y1={points[a]!.y * 240}
      x2={points[b]!.x * 320} y2={points[b]!.y * 240} /> : null)}
    {points.map((p, i) => visible(p) && <circle key={i} cx={p.x * 320} cy={p.y * 240} r={1.7} />)}
  </g>;
}

export const VisionOverlay = memo(function VisionOverlay({ scene, mirrored = false, region }: {
  scene?: Scene; mirrored?: boolean; region?: Box;
}) {
  const objects = scene?.objects ?? [];
  return <svg className="vision-overlay" viewBox="0 0 320 240" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <g transform={mirrored ? 'translate(320 0) scale(-1 1)' : undefined}>
      <g className="vision-overlay__body"><Skeleton points={scene?.pose ?? []} links={BODY_LINKS} /></g>
      <g className="vision-overlay__hands">{scene?.hands.map((hand, i) =>
        <Skeleton key={i} points={hand} links={HAND_LINKS} />)}</g>
    </g>
    {[...objects, ...(region ? [{ box: region, label: 'Colour found', confidence: 1,
      nearHand: nearHand(region, scene?.hands ?? []) }] : [])].map((obj, i) => {
      const [left, top, right, bottom] = obj.box;
      const x = (mirrored ? 1 - right : left) * 320, y = top * 240;
      const label = `${tr(obj.label)}${obj.nearHand ? ` · ${tr('near hand')}` : ''}`;
      return <g key={i} className={`vision-overlay__object ${obj.nearHand ? 'is-near-hand' : ''}`}>
        <rect x={x} y={y} width={(right - left) * 320} height={(bottom - top) * 240} rx={3} />
        <text x={Math.max(4, Math.min(220, x + 3))} y={Math.max(11, y - 5)}>{label}</text>
      </g>;
    })}
  </svg>;
});
