import { useCallback, useEffect, useRef, useState } from 'react';

function friendlyMediaError(error: unknown, microphone = false): string {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return microphone
      ? 'Microphone access is blocked. You can still play muted.'
      : 'Camera access is required to play. Allow camera access in your browser’s site settings, then try again.';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError')
    return microphone
      ? 'No microphone found. You can still play muted.'
      : 'No camera found. Connect a webcam, then try again.';
  if (name === 'NotReadableError' || name === 'TrackStartError')
    return 'Your camera may be busy in another app. Close that app and try again.';
  return microphone
    ? 'The microphone could not start. You can still play muted.'
    : 'Your camera could not start. Check the connection and try again.';
}
export function useMedia() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mounted = useRef(true);
  const cameraRequest = useRef(0);
  const micRequest = useRef(0);
  const acquiringMic = useRef(false);
  const [status, setStatus] = useState<'idle' | 'requesting' | 'ready' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);
  const [microphone, setMicrophone] = useState(false);
  const [devices, setDevices] = useState<{ deviceId: string; label: string }[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const refreshDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices?.enumerateDevices();
      if (mounted.current && all)
        setDevices(
          all
            .filter((d) => d.kind === 'videoinput')
            .map((d, i) => ({
              deviceId: d.deviceId,
              label: d.label || 'Camera ' + (i + 1),
            })),
        );
    } catch {
      /* Enumeration is optional. */
    }
  }, []);
  const stop = useCallback(() => {
    cameraRequest.current++;
    micRequest.current++;
    acquiringMic.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
    setCamera(false);
    setMicrophone(false);
    setStatus('idle');
  }, []);
  useEffect(() => {
    mounted.current = true;
    const mediaDevices = navigator.mediaDevices;
    mediaDevices?.addEventListener?.('devicechange', refreshDevices);
    return () => {
      mounted.current = false;
      // Bumping the generation on unmount is the point: an acquisition still in
      // flight must find its id stale and stop the tracks it is handed.
      /* eslint-disable react-hooks/exhaustive-deps */
      cameraRequest.current++;
      micRequest.current++;
      /* eslint-enable react-hooks/exhaustive-deps */
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      mediaDevices?.removeEventListener?.('devicechange', refreshDevices);
    };
  }, [refreshDevices]);
  const start = useCallback(
    async (requestedDeviceId?: string) => {
      if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
        setStatus('error');
        setError(
          'Your browser needs a secure connection to use a camera. Open this battle over HTTPS or localhost.',
        );
        return;
      }
      if (!window.RTCPeerConnection) {
        setStatus('error');
        setError('This browser does not support live battles. Use a current browser.');
        return;
      }
      const requestId = ++cameraRequest.current;
      setStatus('requesting');
      setCamera(false);
      setError(null);
      // Release the old camera before requesting another; retain the independent microphone.
      streamRef.current?.getVideoTracks().forEach((t) => {
        t.stop();
        streamRef.current?.removeTrack(t);
      });
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 24, max: 30 },
            ...(requestedDeviceId
              ? { deviceId: { exact: requestedDeviceId } }
              : { facingMode: 'user' }),
          },
          audio: false,
        });
        if (!mounted.current || requestId !== cameraRequest.current) {
          media.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = media.getVideoTracks()[0];
        if (!video || video.readyState !== 'live') {
          media.getTracks().forEach((t) => t.stop());
          throw new Error('No live camera track');
        }
        const combined = new MediaStream([
          ...media.getVideoTracks(),
          ...(streamRef.current?.getAudioTracks() ?? []),
        ]);
        streamRef.current = combined;
        setStream(combined);
        setDeviceId(video.getSettings().deviceId ?? requestedDeviceId ?? '');
        setCamera(video.enabled && !video.muted);
        setStatus('ready');
        video.onended = () => {
          if (!mounted.current || requestId !== cameraRequest.current) return;
          setCamera(false);
          setStatus('error');
          setError('Your camera disconnected. Reconnect it and try again.');
        };
        video.onmute = () => {
          if (mounted.current && requestId === cameraRequest.current) setCamera(false);
        };
        video.onunmute = () => {
          if (mounted.current && requestId === cameraRequest.current) setCamera(video.enabled);
        };
        void refreshDevices();
      } catch (err) {
        if (mounted.current && requestId === cameraRequest.current) {
          setStatus('error');
          setError(friendlyMediaError(err));
        }
      }
    },
    [refreshDevices],
  );
  const toggleCamera = useCallback(() => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || track.readyState !== 'live') {
      void start();
      return;
    }
    track.enabled = !track.enabled;
    setCamera(track.enabled && !track.muted);
  }, [start]);
  const toggleMic = useCallback(async () => {
    if (!streamRef.current || acquiringMic.current) return;
    const track = streamRef.current.getAudioTracks()[0];
    if (track?.readyState === 'live') {
      track.enabled = !track.enabled;
      setMicrophone(track.enabled);
      return;
    }
    const requestId = ++micRequest.current;
    acquiringMic.current = true;
    try {
      const audio = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      if (!mounted.current || requestId !== micRequest.current || !streamRef.current) {
        audio.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current.getAudioTracks().forEach((t) => {
        t.stop();
        streamRef.current?.removeTrack(t);
      });
      audio.getAudioTracks().forEach((t) => {
        streamRef.current!.addTrack(t);
        t.onended = () => {
          if (mounted.current && requestId === micRequest.current) setMicrophone(false);
        };
      });
      const updated = new MediaStream(streamRef.current.getTracks());
      streamRef.current = updated;
      setStream(updated);
      setMicrophone(audio.getAudioTracks().length > 0);
      setError(null);
    } catch (err) {
      if (mounted.current && requestId === micRequest.current)
        setError(friendlyMediaError(err, true));
    } finally {
      if (requestId === micRequest.current) acquiringMic.current = false;
    }
  }, []);
  return {
    stream,
    status,
    error,
    camera,
    microphone,
    start,
    stop,
    toggleCamera,
    toggleMic,
    devices,
    deviceId,
    selectDevice: start,
    dismissError: () => setError(null),
  };
}
