import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { sql } from 'drizzle-orm';
import type { Database } from '@smanga/db';
import { DRIZZLE } from '@/modules/db/db.provider';

@ApiTags('health')
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Get()
  async check() {
    let dbOk = false;
    try {
      await this.db.execute(sql`SELECT 1`);
      dbOk = true;
    } catch {
      // DB unreachable — surfaced via `db: false` + `status: degraded`
    }
    return {
      status: dbOk ? 'ok' : 'degraded',
      db: dbOk,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}
