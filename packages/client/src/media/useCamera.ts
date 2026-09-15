import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraStatus =
  | 'idle'
  | 'requesting'
  | 'ready'
  | 'denied'
  | 'not-found'
  | 'in-use'
  | 'insecure'
  | 'error';

export interface CameraDevice {
  deviceId: string;
  label: string;
}

export interface CameraState {
  status: CameraStatus;
  /** Player-facing explanation, present whenever the status is not `ready`. */
  message: string | null;
  devices: CameraDevice[];
  deviceId: string | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  request: () => void;
  selectDevice: (deviceId: string) => void;
  stop: () => void;
}

const COPY: Record<Exclude<CameraStatus, 'ready' | 'requesting'>, string> = {
  idle: 'Turn on your camera to play.',
  denied:
    'Your browser is blocking the camera. Open the camera icon in the address bar, allow access, then try again.',
  'not-found': 'No camera found. Plug one in, or try a device that has one.',
  'in-use': 'Another app is holding the camera. Close it — video calls are the usual culprit.',
  insecure: 'Cameras only work over HTTPS. Open this page on a secure address.',
  error: 'The camera could not be started.',
};

function classify(err: unknown): Exclude<CameraStatus, 'ready' | 'requesting' | 'idle'> {
  if (!(err instanceof Error)) return 'error';
  switch (err.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'denied';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'not-found';
    case 'NotReadableError':
    case 'AbortError':
      return 'in-use';
    default:
      return 'error';
  }
}

/**
 * Owns the camera for the whole app: one stream, explicitly released.
 *
 * The failure cases here are the ones players actually hit — a denied prompt, a
 * camera held by a video call, a device unplugged mid-match — and each gets its
 * own status so the UI can say something useful rather than "an error occurred".
 */
export function useCamera(): CameraState {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  /** Guards against an out-of-order resolve when the device is switched fast. */
  const requestIdRef = useRef(0);

  const [status, setStatus] = useState<CameraStatus>('idle');
  const [message, setMessage] = useState<string | null>(COPY.idle);
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);

  const releaseStream = useCallback(() => {
    const stream = streamRef.current;
    streamRef.current = null;
    if (!stream) return;
    for (const track of stream.getTracks()) track.stop();
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices(
        all
          .filter((d) => d.kind === 'videoinput')
          .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` })),
      );
    } catch {
      // Enumeration is a convenience; failing it must not break the camera.
    }
  }, []);

  const open = useCallback(
    async (requestedDeviceId?: string) => {
      if (!window.isSecureContext) {
        setStatus('insecure');
        setMessage(COPY.insecure);
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('error');
        setMessage('This browser does not support camera access.');
        return;
      }

      const requestId = ++requestIdRef.current;
      setStatus('requesting');
      setMessage(null);
      releaseStream();

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 960 },
            height: { ideal: 720 },
            frameRate: { ideal: 30, max: 30 },
            ...(requestedDeviceId
              ? { deviceId: { exact: requestedDeviceId } }
              : { facingMode: 'user' }),
          },
          audio: false,
        });

        // A newer request already won; drop this stream rather than leak it.
        if (requestId !== requestIdRef.current) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }

        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        setDeviceId(track?.getSettings().deviceId ?? requestedDeviceId ?? null);

        // A camera can vanish mid-match: unplugged, or claimed by another app.
        track?.addEventListener('ended', () => {
          if (streamRef.current !== stream) return;
          releaseStream();
          setStatus('in-use');
          setMessage('The camera stopped. Reconnect it and press retry.');
        });

        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          // Autoplay can reject if the element is not yet in the document; the
          // effect below retries once the ref is attached.
          void video.play().catch(() => undefined);
        }
        setStatus('ready');
        setMessage(null);
        void refreshDevices();
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        const kind = classify(err);
        setStatus(kind);
        setMessage(COPY[kind]);
      }
    },
    [releaseStream, refreshDevices],
  );

  // Re-attach the stream whenever the video element appears or is replaced.
  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream || video.srcObject === stream) return;
    video.srcObject = stream;
    void video.play().catch(() => undefined);
  });

  useEffect(() => {
    if (!navigator.mediaDevices?.addEventListener) return;
    const onChange = () => void refreshDevices();
    navigator.mediaDevices.addEventListener('devicechange', onChange);
    return () => navigator.mediaDevices.removeEventListener('devicechange', onChange);
  }, [refreshDevices]);

  useEffect(() => releaseStream, [releaseStream]);

  const request = useCallback(() => void open(), [open]);
  const selectDevice = useCallback((id: string) => void open(id), [open]);
  const stop = useCallback(() => {
    requestIdRef.current++;
    releaseStream();
    setStatus('idle');
    setMessage(COPY.idle);
  }, [releaseStream]);

  return { status, message, devices, deviceId, videoRef, request, selectDevice, stop };
}
