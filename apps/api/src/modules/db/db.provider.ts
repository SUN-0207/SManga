import { loadEnv } from '@/config/env';
import type { Provider } from '@nestjs/common';
import { type Database, createDb } from '@smanga/db';

export const DRIZZLE = Symbol('DRIZZLE');

export const drizzleProvider: Provider = {
  provide: DRIZZLE,
  useFactory: (): Database => {
    const env = loadEnv();
    return createDb(env.DATABASE_URL, env.DB_POOL_MAX);
  },
};
