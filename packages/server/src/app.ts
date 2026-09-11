import type { Server } from 'node:http';
import { config } from './config.js';
import { Gateway } from './gateway.js';
import { createHttpServer } from './http.js';
import { RoomManager } from './rooms.js';
import { log } from './log.js';

const SWEEP_INTERVAL_MS = 30_000;

export interface AppOptions {
  clientDir?: string;
  tickMs?: number;
}

export interface App {
  server: Server;
  rooms: RoomManager;
  listen(port: number, host?: string): Promise<number>;
  close(): Promise<void>;
}

/**
 * Wires the HTTP server, the WebSocket gateway and the room registry together.
 * Split out from the process entry point so tests can run a real server on an
 * ephemeral port rather than mocking the transport.
 */
export function createApp(options: AppOptions = {}): App {
  const rooms = new RoomManager({
    maxRooms: config.maxRooms,
    emptyRoomTtlMs: config.emptyRoomTtlMs,
    maxRoomAgeMs: config.maxRoomAgeMs,
  });

  const server = createHttpServer({ clientDir: options.clientDir ?? config.clientDir, rooms });
  const gateway = new Gateway(rooms);

  server.on('upgrade', (req, socket, head) => {
    let pathname: string;
    try {
      pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    } catch {
      socket.destroy();
      return;
    }
    if (pathname !== '/ws') {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }
    gateway.handleUpgrade(req, socket, head);
  });

  const ticker = setInterval(() => rooms.tick(Date.now()), options.tickMs ?? config.tickMs);
  const sweeper = setInterval(() => rooms.sweep(Date.now()), SWEEP_INTERVAL_MS);
  ticker.unref?.();
  sweeper.unref?.();

  return {
    server,
    rooms,
    listen(port, host = config.host) {
      gateway.start();
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          const address = server.address();
          const bound = typeof address === 'object' && address ? address.port : port;
          log.info('battle server listening', { port: bound, host, env: config.nodeEnv });
          resolve(bound);
        });
      });
    },
    close() {
      clearInterval(ticker);
      clearInterval(sweeper);
      gateway.stop();
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}
