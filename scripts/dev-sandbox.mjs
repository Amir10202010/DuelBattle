import { spawn } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';

/**
 * `npm run dev`, with nothing outside this machine switched on.
 *
 * The root `.env` is a real operator's file. It can carry a live bot token, an
 * AI key with a bill attached, a mail key that sends real letters and a payment
 * key that moves real money. Plain `npm run dev` honours every one of them,
 * which is right for somebody debugging the bot and wrong for anybody — or
 * anything — that only wants to click through the game: a sandbox session
 * would re-register the production webhook and drain the production outbox.
 *
 * The server's env loader never overrides a variable that is already set, even
 * to an empty string, so blanking them here is enough. The database is apart
 * too (`data/sandbox`, ignored by git), so test accounts never land in the file
 * that holds real ones. Email codes are shown in the form, as in any
 * development run without a mail key.
 */
const root = fileURLToPath(new URL('../', import.meta.url));
const env = {
  ...process.env,
  NODE_ENV: 'development',
  TELEGRAM_BOT_ENABLED: '0',
  TELEGRAM_BOT_TOKEN: '',
  GEMINI_API_KEYS: '',
  GEMINI_API_KEY: '',
  YOLO_URL: '',
  RESEND_API_KEY: '',
  BREVO_API_KEY: '',
  GOOGLE_CLIENT_ID: '',
  GOOGLE_CLIENT_SECRET: '',
  STRIPE_SECRET_KEY: '',
  STRIPE_WEBHOOK_SECRET: '',
  ADMIN_EMAILS: '',
  DATA_DIR: fileURLToPath(new URL('../data/sandbox/', import.meta.url)),
};

// One command string through a shell: npm is a .cmd shim on Windows, which
// cannot be spawned directly, and Node warns about argument arrays with a shell.
const child = spawn('npm run dev', { cwd: root, env, stdio: 'inherit', shell: true });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code ?? 0));
