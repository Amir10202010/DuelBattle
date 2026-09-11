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
  const acquiring = useRef(false);
  const [status, setStatus] = useState<'idle' | 'requesting' | 'ready' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);
  const [microphone, setMicrophone] = useState(false);
  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
    setCamera(false);
    setMicrophone(false);
    setStatus('idle');
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  const start = useCallback(async () => {
    if (acquiring.current) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
      setStatus('error');
      setError(
        'Your browser needs a secure connection to use a camera. Open this battle in a current browser over HTTPS or localhost.',
      );
      return;
    }
    if (!window.RTCPeerConnection) {
      setStatus('error');
      setError(
        'This browser does not support live battles. Use a current Chrome, Edge, Firefox, or Safari browser.',
      );
      return;
    }
    acquiring.current = true;
    setStatus('requesting');
    setError(null);
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 24, max: 30 },
          facingMode: 'user',
        },
        audio: false,
      });
      if (!mounted.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = media;
      setStream(media);
      setCamera(true);
      setMicrophone(false);
      setStatus('ready');
      media.getVideoTracks()[0].onended = () => {
        if (mounted.current) {
          setCamera(false);
          setStatus('error');
          setError('Your camera disconnected. Reconnect it and try again.');
        }
      };
    } catch (err) {
      if (mounted.current) {
        setStatus('error');
        setError(friendlyMediaError(err));
      }
    } finally {
      acquiring.current = false;
    }
  }, []);
  const toggleCamera = useCallback(() => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || track.readyState !== 'live') {
      void start();
      return;
    }
    track.enabled = !track.enabled;
    setCamera(track.enabled);
  }, [start]);
  const toggleMic = useCallback(async () => {
    if (!streamRef.current || acquiring.current) return;
    const track = streamRef.current.getAudioTracks()[0];
    if (track && track.readyState === 'live') {
      track.enabled = !track.enabled;
      setMicrophone(track.enabled);
      return;
    }
    acquiring.current = true;
    try {
      const audio = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      if (!mounted.current || !streamRef.current) {
        audio.getTracks().forEach((t) => t.stop());
        return;
      }
      audio.getAudioTracks().forEach((t) => {
        streamRef.current!.addTrack(t);
        t.onended = () => {
          if (mounted.current) setMicrophone(false);
        };
      });
      const updated = new MediaStream(streamRef.current.getTracks());
      streamRef.current = updated;
      setStream(updated);
      setMicrophone(true);
      setError(null);
    } catch (err) {
      if (mounted.current) setError(friendlyMediaError(err, true));
    } finally {
      acquiring.current = false;
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
    dismissError: () => setError(null),
  };
}
