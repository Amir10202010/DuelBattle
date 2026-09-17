import { memo, useEffect, useRef } from 'react';
import { tr } from '../i18n/index.js';
import type { SceneTracking } from '../hooks/useSceneVision.js';
import {
  BODY_LINKS,
  HAND_LINKS,
  HAND_TIPS,
  OneEuro,
  coverMap,
  project,
  visible,
  type Box,
  type CoverMap,
  type Point,
  type Scene,
} from '../vision/types.js';

/** Drawn straight onto the picture, so it reads on light rooms and dark ones. */
const INK = 'rgba(6, 12, 8, 0.55)';
const BODY = '#9df0e4';
const HAND = '#d5f861';
const OBJECT = 'rgba(236, 244, 228, 0.92)';
const HELD = '#d5f861';

interface OverlayProps {
  tracking: SceneTracking;
  /** True for your own camera, which is shown as a mirror. */
  mirrored?: boolean;
  /** The colour detector's current best patch, when a colour round is running. */
  region?: Box;
}

/**
 * What the camera can see, drawn over the camera.
 *
 * On a canvas rather than in the DOM, and driven by the animation frame rather
 * than by React. Tracking lands fifteen to thirty times a second; the screen
 * refreshes sixty or more; and the gap between those two numbers is exactly
 * where "the dots are all over the place" comes from. Every landmark goes
 * through a one-euro filter on the way out, so the drawing keeps moving
 * smoothly between analysed frames instead of teleporting on each one, and a
 * hand held still stops twitching.
 *
 * Nothing here is a verdict, and nothing here leaves the device.
 */
export const VisionOverlay = memo(function VisionOverlay({
  tracking,
  mirrored = false,
  region,
}: OverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const regionRef = useRef<Box | undefined>(region);
  regionRef.current = region;
  // Refs, not the tracking object: these two identities never change, so the
  // draw loop survives the arena's per-frame re-renders.
  const { scene: sceneRef, source: sourceRef } = tracking;

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const smooth = new Smoother();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let box = { width: 0, height: 0 };
    const observer = new ResizeObserver(([entry]) => {
      const rect = entry?.contentRect;
      if (rect) box = { width: rect.width, height: rect.height };
    });
    observer.observe(parent);
    box = { width: parent.clientWidth, height: parent.clientHeight };

    let frame = 0;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.round(box.width * ratio);
      const height = Math.round(box.height * ratio);
      if (width < 2 || height < 2) return;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, box.width, box.height);

      const scene = sceneRef.current;
      const source = sourceRef.current;
      if (!scene || !source.width || !source.height) {
        smooth.reset();
        return;
      }
      const map = coverMap(source.width, source.height, box.width, box.height);
      const now = performance.now();
      const pulse = reduced.matches ? 1 : 0.72 + 0.28 * Math.sin(now / 320);
      paint(context, scene, map, box, mirrored, smooth, now, regionRef.current, pulse);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [sceneRef, sourceRef, mirrored]);

  return <canvas ref={canvasRef} className="vision-overlay" aria-hidden="true" />;
});

// ---------------------------------------------------------------------------

/**
 * One filter per coordinate, kept across frames.
 *
 * Landmark indices are stable within a track, so filter state can follow a
 * joint from frame to frame. Anything that stops being reported simply stops
 * being asked for, and a full reset happens whenever tracking drops out.
 */
class Smoother {
  private readonly filters = new Map<string, OneEuro>();

  reset(): void {
    this.filters.clear();
  }

  point(key: string, point: Point, at: number): Point {
    return {
      x: this.axis(`${key}x`, point.x, at),
      y: this.axis(`${key}y`, point.y, at),
      ...(point.visibility === undefined ? {} : { visibility: point.visibility }),
    };
  }

  /** Boxes get a lazier filter: a jittering label is worse than a late one. */
  box(key: string, box: Box, at: number): Box {
    return [
      this.axis(`${key}0`, box[0], at, 0.8),
      this.axis(`${key}1`, box[1], at, 0.8),
      this.axis(`${key}2`, box[2], at, 0.8),
      this.axis(`${key}3`, box[3], at, 0.8),
    ];
  }

  private axis(key: string, value: number, at: number, cutoff = 1.7): number {
    let filter = this.filters.get(key);
    if (!filter) this.filters.set(key, (filter = new OneEuro(cutoff, 0.035)));
    return filter.filter(value, at);
  }
}

function paint(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  map: CoverMap,
  box: { width: number; height: number },
  mirrored: boolean,
  smooth: Smoother,
  at: number,
  region: Box | undefined,
  pulse: number,
) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Body first, so hands and held objects sit on top of it.
  const body = scene.pose.map((p, i) => (visible(p) ? smooth.point(`b${i}`, p, at) : undefined));
  drawLimbs(ctx, body, BODY_LINKS, map, mirrored, 5, 2.4, BODY, 0.62);
  for (const point of body) {
    if (point) dot(ctx, project(point, map, mirrored), 2.6, BODY, 0.75);
  }

  scene.hands.forEach((hand, index) => {
    const points = hand.map((p, i) =>
      visible(p) ? smooth.point(`h${index}:${i}`, p, at) : undefined,
    );
    drawLimbs(ctx, points, HAND_LINKS, map, mirrored, 5.5, 2.6, HAND, 0.95);
    for (const tip of HAND_TIPS) {
      const point = points[tip];
      if (point) dot(ctx, project(point, map, mirrored), tip === 0 ? 3.4 : 3.8, HAND, 1);
    }
  });

  for (const [i, object] of scene.objects.entries()) {
    drawBox(ctx, {
      box: smooth.box(`o${i}:${object.label}`, object.box, at),
      label: tr(object.label),
      held: object.nearHand,
    }, map, mirrored, pulse);
  }

  /*
   * The colour detector's patch is measured in a different space.
   *
   * Tracking looks at the whole camera frame; the colour check looks at the 4:3
   * window that actually gets photographed, which is also exactly the box this
   * canvas covers. So its coordinates go on unchanged, and running them through
   * the tracking map would slide the patch sideways on every widescreen webcam
   * in the world.
   */
  if (region) {
    const windowMap: CoverMap = { scaleX: box.width, scaleY: box.height, offsetX: 0, offsetY: 0 };
    drawBox(ctx, { box: smooth.box('region', region, at), label: tr('Match'), held: true },
      windowMap, mirrored, pulse);
  }
}

function drawLimbs(
  ctx: CanvasRenderingContext2D,
  points: readonly (Point | undefined)[],
  links: readonly (readonly [number, number])[],
  map: CoverMap,
  mirrored: boolean,
  outer: number,
  inner: number,
  color: string,
  alpha: number,
) {
  const segments: [{ x: number; y: number }, { x: number; y: number }][] = [];
  for (const [a, b] of links) {
    const from = points[a];
    const to = points[b];
    if (from && to) segments.push([project(from, map, mirrored), project(to, map, mirrored)]);
  }
  if (segments.length === 0) return;

  // Two passes instead of a shadow: a dark backing stroke keeps the line
  // readable against a bright room, and costs a fraction of a canvas blur.
  const stroke = (width: number, style: string, opacity: number) => {
    ctx.beginPath();
    for (const [from, to] of segments) {
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
    }
    ctx.lineWidth = width;
    ctx.strokeStyle = style;
    ctx.globalAlpha = opacity;
    ctx.stroke();
  };
  stroke(outer, INK, alpha);
  stroke(inner, color, alpha);
  ctx.globalAlpha = 1;
}

function dot(
  ctx: CanvasRenderingContext2D,
  at: { x: number; y: number },
  radius: number,
  color: string,
  alpha: number,
) {
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(at.x, at.y, radius + 1.2, 0, Math.PI * 2);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(at.x, at.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalAlpha = 1;
}

/**
 * A corner-bracket reticle rather than a rectangle.
 *
 * A full box over somebody's face draws a hard line through the thing it is
 * meant to point at. Brackets say the same thing and leave the subject visible,
 * which matters when the subject is the answer you are about to photograph.
 */
function drawBox(
  ctx: CanvasRenderingContext2D,
  entry: { box: Box; label: string; held: boolean },
  map: CoverMap,
  mirrored: boolean,
  pulse: number,
) {
  const [x0, y0, x1, y1] = entry.box;
  const a = project({ x: mirrored ? x1 : x0, y: y0 }, map, false);
  const b = project({ x: mirrored ? x0 : x1, y: y1 }, map, false);
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const width = Math.abs(b.x - a.x);
  const height = Math.abs(b.y - a.y);
  if (width < 6 || height < 6) return;

  const color = entry.held ? HELD : OBJECT;
  const arm = Math.min(18, width * 0.28, height * 0.28);
  const corners: [number, number, number, number][] = [
    [left, top, 1, 1],
    [left + width, top, -1, 1],
    [left, top + height, 1, -1],
    [left + width, top + height, -1, -1],
  ];
  const path = () => {
    ctx.beginPath();
    for (const [cx, cy, dx, dy] of corners) {
      ctx.moveTo(cx + dx * arm, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + dy * arm);
    }
  };
  ctx.globalAlpha = entry.held ? pulse : 0.8;
  path();
  ctx.lineWidth = 6;
  ctx.strokeStyle = INK;
  ctx.stroke();
  path();
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.globalAlpha = 1;

  if (!entry.label) return;
  ctx.font = '600 12px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  const text = entry.label.toUpperCase();
  const padding = 7;
  const chipWidth = ctx.measureText(text).width + padding * 2;
  const chipHeight = 20;
  const chipX = Math.max(2, Math.min(left, map.scaleX + map.offsetX - chipWidth - 2));
  const chipY = top - chipHeight - 5 < 2 ? top + height + 5 : top - chipHeight - 5;
  ctx.fillStyle = entry.held ? 'rgba(20, 30, 8, 0.86)' : 'rgba(10, 14, 10, 0.78)';
  roundRect(ctx, chipX, chipY, chipWidth, chipHeight, 6);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.5;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = entry.held ? HELD : '#f2f6ec';
  ctx.fillText(text, chipX + padding, chipY + chipHeight / 2 + 0.5);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, width, height, radius);
  else ctx.rect(x, y, width, height);
}
