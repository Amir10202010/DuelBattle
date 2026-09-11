import { z } from 'zod';
import { detectionSchema, type Detection } from '../shared/judging';

export interface ObjectDetector {
  detect(images: string[], signal: AbortSignal): Promise<Detection[][]>;
}

/** Optional, local YOLO service. Its hints cannot award points. */
export class YoloObjectDetector implements ObjectDetector {
  constructor(
    private url = 'http://127.0.0.1:8001',
    private token = '',
    private fetcher: typeof fetch = fetch,
  ) {}
  async detect(images: string[], signal: AbortSignal): Promise<Detection[][]> {
    const response = await this.fetcher(`${this.url.replace(/\/$/, '')}/detect`, {
      method: 'POST',
      signal: AbortSignal.any([signal, AbortSignal.timeout(4000)]),
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
