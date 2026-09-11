import { useCallback, useEffect, useRef, useState } from 'react';
import type { Attempt } from '../../shared/protocol';
import { copyText, getName, navigate, request } from '../lib/client';
import { useMedia } from './useMedia';
import { usePeer } from './usePeer';
import { useColorGuide } from './useColorGuide';
import { useConnection, useServerNow } from './useConnection';

export function useBattle(code: string, connection: ReturnType<typeof useConnection>) {
  const { socket, profile, connected, connectionEpoch, refreshProfile } = connection;
  const room = connection.room?.code === code ? connection.room : null;
  const [name, setName] = useState(getName);
  const [draftName, setDraftName] = useState(getName);
  const [joined, setJoined] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinRetry, setJoinRetry] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [copied, setCopied] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const me = room?.players.find((p) => p.id === profile?.id);
  const opponent = room?.players.find((p) => p.id !== profile?.id);
  const media = useMedia();
  const stopMedia = media.stop;
  const controlRef = useRef({ joined, socket });
  controlRef.current = { joined, socket };
  useEffect(
    () => () => {
      const current = controlRef.current;
      if (current.joined && current.socket?.connected)
        void request(current.socket, 'leave', { roomCode: code }).catch(() => {});
    },
    [code],
  );
  useEffect(() => {
    if (room?.state === 'CANCELLED' || joinError) stopMedia();
  }, [room?.state, joinError, stopMedia]);
  const peer = usePeer({
    socket,
    code,
    userId: profile?.id ?? '',
    opponentId: opponent?.id,
    opponentConnected: !!opponent?.connected,
    stream: media.stream,
    connected: connected && joined,
    epoch: connectionEpoch,
  });
  const now = useServerNow(connection.offset);
  const active = room?.state === 'CHALLENGE_ACTIVE';
  const color = room?.round?.challenge.color;
  const detected = useColorGuide(videoRef, color, !!active && media.camera);
  const inviteLink = `${window.location.origin}/battle/${code}`;
  useEffect(() => {
    if (!socket || !connected || !name) {
      if (!connected) setJoined(false);
      return;
    }
    let disposed = false;
    setJoinError(null);
    void request(socket, 'join', { roomCode: code, name })
      .then(() => {
        if (!disposed) setJoined(true);
      })
      .catch((err) => {
        if (!disposed) {
          setJoined(false);
          setJoinError((err as Error).message);
        }
      });
    return () => {
      disposed = true;
    };
  }, [socket, connected, connectionEpoch, name, code, joinRetry]);
  useEffect(() => {
    if (!socket || !joined || !connected || room?.state === 'CANCELLED') return;
    void request(socket, 'media', {
      roomCode: code,
      camera: media.camera,
      microphone: media.microphone,
    }).catch((err) => setError((err as Error).message));
  }, [
    socket,
    joined,
    connected,
    connectionEpoch,
    code,
    media.camera,
    media.microphone,
    room?.state,
  ]);
  useEffect(() => {
    if (room?.matchId) {
      void refreshProfile();
      setShowInvite(false);
    }
  }, [room?.matchId, refreshProfile]);
  useEffect(() => {
    if (!joined) return;
    const prevent = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [joined]);
  const run = useCallback(async (fn: () => Promise<unknown>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Please try again.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);
  const leave = async () => {
    if (joined && socket?.connected) await request(socket, 'leave', { roomCode: code });
    connection.setRoom(null);
    navigate('/');
  };
  const copy = async () => {
    setShowInvite(true);
    try {
      await copyText(inviteLink);
      setCopied(true);
    } catch {
      setError('Copy is unavailable. Select the invite link below and copy it.');
    }
  };
  const submit = () =>
    run(async () => {
      const v = videoRef.current;
      if (!v || v.readyState < 2 || !media.camera || !room?.round || !socket)
        throw new Error('Wait for your camera to load, then try again.');
      const canvas = document.createElement('canvas');
      const scale = 480 / Math.max(v.videoWidth, v.videoHeight);
      canvas.width = Math.max(1, Math.round(v.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(v.videoHeight * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Snapshot capture is unavailable in this browser.');
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      await request(socket, 'submit', {
        roomCode: code,
        roundId: room.round.id,
        nonce: crypto.randomUUID(),
        image: canvas.toDataURL('image/jpeg', 0.65),
      });
    });
  const review = (attempt: Attempt, accept: boolean) => {
    if (socket && room?.round)
      void run(() =>
        request(socket, 'review', {
          roomCode: code,
          roundId: room.round!.id,
          attemptId: attempt.id,
          accept,
        }),
      );
  };
  const matchState = room && !['WAITING_FOR_PLAYER', 'READY', 'CANCELLED'].includes(room.state);
  const myAttempts = room?.round?.attempts.filter((a) => a.playerId === profile?.id) ?? [];
  const pending = myAttempts.some((a) => a.status === 'pending' || a.status === 'accepted');
  return {
    socket,
    profile,
    connected,
    room,
    name,
    setName,
    draftName,
    setDraftName,
    joined,
    joinError,
    setJoinRetry,
    error,
    setError,
    busy,
    copied,
    showInvite,
    setShowInvite,
    confirmLeave,
    setConfirmLeave,
    videoRef,
    me,
    opponent,
    media,
    peer,
    now,
    active,
    color,
    detected,
    inviteLink,
    run,
    leave,
    copy,
    submit,
    review,
    matchState,
    myAttempts,
    pending,
  };
}
