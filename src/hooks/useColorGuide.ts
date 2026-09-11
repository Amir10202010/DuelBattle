import { useEffect, useState, type RefObject } from 'react';
import { colorFraction, TemporalColorGuide, type ColorTarget } from '../vision/color';

export function useColorGuide(
  video: RefObject<HTMLVideoElement | null>,
  target: ColorTarget | undefined,
  enabled: boolean,
) {
  const [detected, setDetected] = useState(false);
  useEffect(() => {
    setDetected(false);
    if (!enabled || !target) return;
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 96;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    const temporal = new TemporalColorGuide();
    const interval = setInterval(() => {
      const v = video.current;
      if (!v || v.readyState < 2 || document.hidden) {
        temporal.reset();
        setDetected(false);
        return;
      }
      // Sample only the central presentation zone. This is guidance, not person/possession detection.
      ctx.drawImage(
        v,
        v.videoWidth * 0.3,
        v.videoHeight * 0.2,
        v.videoWidth * 0.4,
        v.videoHeight * 0.6,
        0,
        0,
        96,
        96,
      );
      setDetected(temporal.update(colorFraction(ctx.getImageData(0, 0, 96, 96).data, target)));
    }, 250);
    return () => clearInterval(interval);
  }, [video, target, enabled]);
  return detected;
}
