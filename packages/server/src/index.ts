import { createApp } from './app.js';
import { config } from './config.js';
import { log } from './log.js';

const app = createApp();

await app.listen(config.port);

let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info('shutting down', { signal });
  void app.close().then(() => process.exit(0));
  // Do not let a half-closed keep-alive socket hold the process open forever.
  setTimeout(() => process.exit(0), 5_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  log.error('unhandled rejection', {
    reason: reason instanceof Error ? reason.stack : String(reason),
  });
});
