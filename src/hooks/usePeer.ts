import { useCallback, useEffect, useRef, useState } from 'react';
import type { Signal } from '../../shared/protocol';
import { request, type GameSocket } from '../lib/client';

interface PeerOptions {
  socket: GameSocket | null;
  code: string;
  userId: string;
  opponentId?: string;
  opponentConnected: boolean;
  stream: MediaStream | null;
  connected: boolean;
  epoch: number;
}
export function usePeer({
  socket,
  code,
  userId,
  opponentId,
  opponentConnected,
  stream,
  connected,
  epoch,
}: PeerOptions) {
  const [remote, setRemote] = useState<MediaStream | null>(null);
  const [state, setState] = useState<RTCPeerConnectionState>('new');
  const [retry, setRetry] = useState(0);
  const connection = useRef<RTCPeerConnection | null>(null);
  const connectionReady = useRef(false);
  const latestStream = useRef(stream);
  latestStream.current = stream;
  useEffect(() => {
    if (!socket || !opponentId || !opponentConnected || !connected) {
      setRemote(null);
      setState('new');
      return;
    }
    let disposed = false;
    let makingOffer = false;
    let ignoreOffer = false;
    let settingRemoteAnswer = false;
    const polite = userId > opponentId;
    const pc = new RTCPeerConnection();
    connection.current = pc;
    connectionReady.current = false;
    const remoteStream = new MediaStream();
    setRemote(remoteStream);
    setState('new');
    let queued: RTCIceCandidateInit[] = [];
    let initialized = false;
    let initialSignals: Signal[] = [];
    let chain = Promise.resolve();
    const signal = (data: Omit<Signal, 'roomCode'>) => {
      if (!disposed)
        void request(socket, 'signal', { roomCode: code, ...data }).catch(() => {
          if (!disposed) setState('disconnected');
        });
    };
    const receive = async (data: Signal) => {
      if (disposed || data.roomCode !== code) return;
      if (!initialized) {
        initialSignals.push(data);
        return;
      }
      try {
        if (data.description) {
          const readyForOffer =
            !makingOffer && (pc.signalingState === 'stable' || settingRemoteAnswer);
          const collision = data.description.type === 'offer' && !readyForOffer;
          ignoreOffer = !polite && collision;
          if (ignoreOffer) return;
          settingRemoteAnswer = data.description.type === 'answer';
          await pc.setRemoteDescription(data.description);
          settingRemoteAnswer = false;
          for (const candidate of queued) await pc.addIceCandidate(candidate);
          queued = [];
          if (data.description.type === 'offer') {
            await pc.setLocalDescription();
            if (pc.localDescription)
              signal({ description: { type: 'answer', sdp: pc.localDescription.sdp } });
          }
        } else if (data.candidate && !ignoreOffer) {
          if (pc.remoteDescription) await pc.addIceCandidate(data.candidate);
          else queued.push(data.candidate);
        }
      } catch {
        if (!disposed) setState('failed');
      }
    };
    const enqueue = (data: Signal) => {
      chain = chain.then(() => receive(data));
    };
    socket.on('signal', enqueue);
    pc.onicecandidate = ({ candidate }) => {
      if (candidate)
        signal({ candidate: { ...candidate.toJSON(), candidate: candidate.candidate } });
    };
    pc.ontrack = ({ track }) => {
      remoteStream.addTrack(track);
      setRemote(new MediaStream(remoteStream.getTracks()));
    };
    pc.onconnectionstatechange = () => {
      if (!disposed) setState(pc.connectionState);
    };
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed' && !disposed) pc.restartIce();
    };
    pc.onnegotiationneeded = async () => {
      if (!initialized || disposed) return;
      try {
        makingOffer = true;
        await pc.setLocalDescription();
        if (pc.localDescription && ['offer', 'answer'].includes(pc.localDescription.type))
          signal({
            description: {
              type: pc.localDescription.type as 'offer' | 'answer',
              sdp: pc.localDescription.sdp,
            },
          });
      } catch {
        if (!disposed) setState('failed');
      } finally {
        makingOffer = false;
      }
    };
    void fetch('/api/ice')
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const config = (await response.json()) as { iceServers: RTCIceServer[] };
        if (disposed) return;
        pc.setConfiguration({ iceServers: config.iceServers });
        initialized = true;
        connectionReady.current = true;
        for (const track of latestStream.current?.getTracks() ?? [])
          pc.addTrack(track, latestStream.current!);
        for (const data of initialSignals) enqueue(data);
        initialSignals = [];
      })
      .catch(() => {
        if (!disposed) setState('failed');
      });
    return () => {
      disposed = true;
      socket.off('signal', enqueue);
      pc.close();
      remoteStream.getTracks().forEach((t) => t.stop());
      if (connection.current === pc) connection.current = null;
    };
  }, [socket, code, userId, opponentId, opponentConnected, connected, epoch, retry]);
  useEffect(() => {
    const pc = connection.current;
    if (!pc || !connectionReady.current || pc.signalingState === 'closed' || !stream) return;
    for (const track of stream.getTracks()) {
      const sender = pc.getSenders().find((s) => s.track?.kind === track.kind);
      if (sender) {
        if (sender.track !== track) void sender.replaceTrack(track).catch(() => setState('failed'));
      } else pc.addTrack(track, stream);
    }
  }, [stream]);
  const reconnect = useCallback(() => {
    const pc = connection.current;
    if (pc && pc.signalingState !== 'closed') pc.restartIce();
    else setRetry((n) => n + 1);
  }, []);
  return { remote, state, reconnect };
}
