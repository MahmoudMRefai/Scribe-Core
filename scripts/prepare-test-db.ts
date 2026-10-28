/**
 * Reset the TEST database to the current Prisma schema.
 *
 *   npm run db:test:prepare
 *
 * Uses `db push --force-reset` (not `migrate deploy`) because the committed
 * migration history predates parts of the live schema. Refuses to run unless
 * DATABASE_URL_TEST is set and differs from DATABASE_URL.
 */
import 'dotenv/config';
import { execSync } from 'node:child_process';

const testUrl = process.env.DATABASE_URL_TEST;
if (!testUrl) {
  console.error('DATABASE_URL_TEST is not set — refusing to continue.');
  process.exit(1);
}
if (testUrl === process.env.DATABASE_URL) {
  console.error('DATABASE_URL_TEST equals DATABASE_URL — refusing to wipe the dev database.');
  process.exit(1);
}

const env = { ...process.env, DATABASE_URL: testUrl };
const run = (cmd: string) => execSync(cmd, { stdio: 'inherit', env });

run('npx prisma db push --force-reset --skip-generate --accept-data-loss');
run('npx prisma db execute --file prisma/sql/wallet_transaction_immutable.sql --schema prisma/schema.prisma');
console.log('✅ Test database ready');
