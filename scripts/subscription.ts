import { existsSync } from 'node:fs';
import { Store } from '../server/store';
if (existsSync('.env')) process.loadEnvFile('.env');
const [userId, expires] = process.argv.slice(2);
if (!userId || !expires || !Number.isFinite(Date.parse(expires))) {
  console.error('Usage: npm run subscription -- <user-id> <ISO-expiry-date>');
  process.exit(1);
}
const store = new Store(process.env.DATABASE_PATH ?? './data/duelbattle.sqlite');
try {
  store.grantPremium(userId, Date.parse(expires));
  console.log('Server entitlement updated. No payment was processed.');
} finally {
  store.close();
}
