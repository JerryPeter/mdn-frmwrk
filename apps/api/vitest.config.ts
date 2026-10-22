import 'dotenv/config';
import { defineConfig } from 'vitest/config';

const testDb = process.env.TEST_DB_NAME || 'modena_test';
if (testDb === process.env.DB_NAME) throw new Error('TEST_DB_NAME tidak boleh sama dengan DB_NAME (database dev).');

const { DB_USER, DB_PASSWORD, DB_HOST, DB_PORT } = process.env;
const testUrl = `postgresql://${DB_USER}:${encodeURIComponent(DB_PASSWORD ?? '')}@${DB_HOST}:${DB_PORT}/${testDb}?schema=usrmgnt`;

export default defineConfig({
  test: {
    globalSetup: ['tests/global-setup.ts'],
    env: { NODE_ENV: 'test', DATABASE_URL: testUrl, REDIS_KEY_PREFIX: 'test:' },
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 120_000,
  },
});
