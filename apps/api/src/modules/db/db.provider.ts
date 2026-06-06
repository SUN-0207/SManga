import { loadEnv } from '@/config/env';
import type { Provider } from '@nestjs/common';
import { type Database, createDb } from '@smanga/db';

export const DRIZZLE = Symbol('DRIZZLE');

export const drizzleProvider: Provider = {
  provide: DRIZZLE,
  useFactory: (): Database => createDb(loadEnv().DATABASE_URL),
};
