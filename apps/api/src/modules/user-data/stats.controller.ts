import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StatsService } from './stats.service';
import { ReadingEtaDto } from './dto/reading-eta.dto';
import { JwtAuthGuard } from '@/common/guards/jwt.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

@ApiTags('stats')
@Controller({ path: 'me/stats', version: '1' })
@UseGuards(JwtAuthGuard)
export class StatsController {
  constructor(private readonly svc: StatsService) {}

  @Get()
  stats(@CurrentUser() u: { id: string }) {
    return this.svc.getStats(u.id);
  }

  /**
   * GET /api/v1/me/stats/reading-speed
   * Returns heuristic reading speed (1500 words/chapter average).
   * Returns wordsPerMinute=0 when insufficient data (<60 s or <1 chapter).
   */
  @Get('reading-speed')
  readingSpeed(@CurrentUser() u: { id: string }) {
    return this.svc.getReadingSpeed(u.id);
  }

  /**
   * GET /api/v1/me/stats/reading-eta?storyId=:uuid
   * Returns estimated minutes to finish a story for the authenticated user.
   * Returns HTTP 200 with null body when user has no progress or story is
   * already finished (not 204 — NestJS serializes returned null as 200+null).
   */
  @Get('reading-eta')
  async readingEta(@CurrentUser() u: { id: string }, @Query() q: ReadingEtaDto) {
    return this.svc.getReadingEta(u.id, q.storyId);
  }
}
