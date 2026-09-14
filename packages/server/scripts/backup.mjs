import { DatabaseSync } from 'node:sqlite';
import process from 'node:process';
import { existsSync, mkdirSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// VACUUM INTO takes a consistent snapshot, including committed WAL contents.
// Keep the output outside the live data volume for an off-host backup.
const source = resolve(process.argv[2] ?? process.env.DATA_DIR ?? './data', 'battle.sqlite');
const destination = process.argv[3] ? resolve(process.argv[3]) : null;
if (!destination || !existsSync(source) || existsSync(destination)) {
  process.stderr.write(
    'Usage: node packages/server/scripts/backup.mjs <data-dir> <new-backup.sqlite>\nSource must exist; destination must not exist.\n',
  );
  process.exit(1);
}
mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
const db = new DatabaseSync(source, { readOnly: true });
try {
  db.exec('PRAGMA busy_timeout=5000');
  db.prepare('VACUUM INTO ?').run(destination);
  chmodSync(destination, 0o600);
  process.stdout.write(
    'Database snapshot saved. Copy it and identity.key to secure off-host storage.\n',
  );
} finally {
  db.close();
}
