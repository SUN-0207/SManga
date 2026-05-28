import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(16),
  FRONTEND_BASE_URL: z.string().url().default('http://localhost:3000'),
  LOG_LEVEL: z.string().default('info'),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(): Env {
  return schema.parse(process.env);
}
