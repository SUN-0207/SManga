// apps/api/src/modules/rankings/rankings.controller.ts
import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { RankingsQueryDto } from './dto/rankings-query.dto';
import { RankingsService } from './rankings.service';

/**
 * All /rankings/* endpoints are public — no @UseGuards.
 * @Throttle overrides the global 120/min to 60/min per handler to deter bot scraping.
 */
@ApiTags('rankings')
@Controller({ path: 'rankings', version: '1' })
export class RankingsController {
  constructor(private readonly svc: RankingsService) {}

  /** GET /api/v1/rankings/hot — top 50 by weekly unique readers (fixed, no pagination) */
  @Get('hot')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  getHot(@Query() q: RankingsQueryDto) {
    const limit = Math.min(q.limit ?? 50, 50);
    return this.svc.getHot(limit);
  }

  /** GET /api/v1/rankings/views — paginated, ordered by all-time view_count DESC */
  @Get('views')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  getViews(@Query() q: RankingsQueryDto) {
    return this.svc.getViews(q.page ?? 1, q.limit ?? 50);
  }

  /** GET /api/v1/rankings/rating — paginated, HAVING count >= 3, ordered by avg DESC */
  @Get('rating')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  getRating(@Query() q: RankingsQueryDto) {
    return this.svc.getRating(q.page ?? 1, q.limit ?? 50);
  }

  /** GET /api/v1/rankings/completed — paginated, WHERE status='completed', ordered by updated_at DESC */
  @Get('completed')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  getCompleted(@Query() q: RankingsQueryDto) {
    return this.svc.getCompleted(q.page ?? 1, q.limit ?? 50);
  }
}
