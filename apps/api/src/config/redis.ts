import { Redis } from 'ioredis';
import { env } from './env.js';

/**
 * Redis dipakai sebagai cache (bukan sumber data). Bila Redis tidak tersedia,
 * pemanggil wajib fallback ke database, sehingga perintah dibuat gagal cepat.
 */
export const redis = new Redis(env.REDIS_URL, {
  keyPrefix: env.REDIS_KEY_PREFIX,
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
});

let warned = false;
redis.on('error', (err) => {
  if (!warned) {
    console.warn(`[redis] tidak tersedia, cache dinonaktifkan sementara: ${err.message}`);
    warned = true;
  }
});
redis.on('ready', () => {
  warned = false;
});

export async function connectRedis() {
  try {
    await redis.connect();
  } catch {
    /* sudah dicatat oleh handler 'error'; aplikasi tetap jalan tanpa cache */
  }
}
