import { z } from 'zod';
import { detectionSchema } from '@battle/shared/validation';
import type { Detection } from '@battle/shared';

export interface ObjectDetector {
  detect(images: readonly string[], signal: AbortSignal): Promise<Detection[][]>;
}

/**
 * An optional local YOLO service, running beside the game rather than in it.
 *
 * Its output is a hint and nothing more: it is handed to the referee alongside
 * the photographs, clearly labelled as fallible, and it can never award a
 * point on its own. A limited object vocabulary that has never heard of the
 * thing you are holding must not be able to say you are holding nothing — so
 * when this is unreachable the round still gets judged, just without the hint.
 */
export class YoloObjectDetector implements ObjectDetector {
  constructor(
    private readonly url = 'http://127.0.0.1:8001',
    private readonly token = '',
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async detect(images: readonly string[], signal: AbortSignal): Promise<Detection[][]> {
    const response = await this.fetcher(`${this.url.replace(/\/$/, '')}/detect`, {
      method: 'POST',
      // A hint is not worth holding a round open for.
      signal: AbortSignal.any([signal, AbortSignal.timeout(4_000)]),
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      body: JSON.stringify({ images }),
    });
    if (!response.ok) throw new Error('YOLO detector unavailable');

    const result = z
      .object({ detections: z.array(z.array(detectionSchema).max(20)).length(images.length) })
      .parse(await response.json());
    return result.detections;
  }
}
