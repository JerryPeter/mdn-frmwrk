import { createApp } from './app.js';
import { prisma } from './config/db.js';
import { env } from './config/env.js';
import { connectRedis, redis } from './config/redis.js';

await connectRedis();
const server = createApp().listen(env.PORT, () => {
  console.log(`[api] berjalan di http://localhost:${env.PORT}/api/v1 (${env.NODE_ENV})`);
});

async function shutdown() {
  server.close();
  await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
