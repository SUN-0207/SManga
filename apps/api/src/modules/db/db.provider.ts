import { type Provider } from '@nestjs/common';
import { createDb, type Database } from '@smanga/db';
import { loadEnv } from '@/config/env';

export const DRIZZLE = Symbol('DRIZZLE');

export const drizzleProvider: Provider = {
  provide: DRIZZLE,
  useFactory: (): Database => createDb(loadEnv().DATABASE_URL),
};
