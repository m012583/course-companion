import { env } from 'cloudflare:workers';

export function storage() {
  return env as unknown as { DB: D1Database; FILES: R2Bucket };
}
