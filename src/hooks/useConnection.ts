import { useCallback, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { PROTOCOL_VERSION, type Profile, type RoomSnapshot } from '../../shared/protocol';
import { fetchProfile, type GameSocket } from '../lib/client';

export function useConnection() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [socket, setSocket] = useState<GameSocket | null>(null);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [connectionEpoch, setEpoch] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [latency, setLatency] = useState<number | null>(null);
  const [retry, setRetry] = useState(0);
  const refreshProfile = useCallback(async () => {
    try {
      setProfile(await fetchProfile());
    } catch {
      /* Current match can continue while usage refresh is unavailable. */
    }
  }, []);
  useEffect(() => {
    let active = true;
    let client: GameSocket | undefined;
    let probe: ReturnType<typeof setInterval> | undefined;
    const controller = new AbortController();
    const online = () => {
      if (client) client.connect();
      else setRetry((n) => n + 1);
    };
    const offline = () => client?.disconnect();
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    setError(null);
    void fetchProfile(controller.signal)
      .then((p) => {
        if (!active) return;
        setProfile(p);
        client = io({
          autoConnect: false,
          auth: { csrf: p.csrf, protocol: PROTOCOL_VERSION },
          reconnectionDelay: 500,
          reconnectionDelayMax: 3000,
        });
        setSocket(client);
        const sync = () => {
          if (!client?.connected) return;
          const start = Date.now();
          client.timeout(3000).emit('clock', (err: Error | null, serverNow: number) => {
            if (!active || err) return;
            const elapsed = Date.now() - start;
            setOffset(serverNow - (start + elapsed / 2));
            setLatency(elapsed);
          });
        };
        client.on('connect', () => {
          setConnected(true);
          setEpoch((n) => n + 1);
          setError(null);
          sync();
        });
        client.on('disconnect', () => setConnected(false));
        client.on('connect_error', () => {
          setConnected(false);
          setError('Unable to connect. Check your network, or refresh your session.');
        });
        client.on('snapshot', (snapshot) =>
          setRoom((previous) =>
            previous?.code === snapshot.code && previous.revision > snapshot.revision
              ? previous
              : snapshot,
          ),
        );
        client.on('notice', (message) => setError(message));
        client.connect();
        probe = setInterval(sync, 10_000);
      })
      .catch(() => {
        if (active) setError('The arena is unavailable. Check your connection and try again.');
      });
    return () => {
      active = false;
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      controller.abort();
      clearInterval(probe);
      client?.disconnect();
    };
  }, [retry]);
  return {
    profile,
    socket,
    room,
    setRoom,
    connected,
    connectionEpoch,
    error,
    offset,
    latency,
    refreshProfile,
    retry: () => setRetry((n) => n + 1),
  };
}
export function useServerNow(offset: number) {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now() + offset), 100);
    return () => clearInterval(tick);
  }, [offset]);
  return now;
}
