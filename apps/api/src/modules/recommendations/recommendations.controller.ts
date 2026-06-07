import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt.guard';
// apps/api/src/modules/recommendations/recommendations.controller.ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ForYouQueryDto } from './dto/for-you-query.dto';
import { SimilarQueryDto } from './dto/similar-query.dto';
import { RecommendationsService } from './recommendations.service';

/**
 * GET /api/v1/recommendations/similar?storyId=:uuid&limit=8
 * Public — no @UseGuards. Throttled to 60/min.
 */
@ApiTags('recommendations')
@Controller({ path: 'recommendations', version: '1' })
export class RecommendationsController {
  constructor(private readonly svc: RecommendationsService) {}

  @Get('similar')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  similar(@Query() q: SimilarQueryDto) {
    return this.svc.getSimilar(q.storyId, q.limit ?? 8);
  }
}

/**
 * GET /api/v1/me/recommendations?limit=8
 * Auth required. Throttled to 60/min.
 */
@ApiTags('recommendations')
@Controller({ path: 'me/recommendations', version: '1' })
@UseGuards(JwtAuthGuard)
export class MeRecommendationsController {
  constructor(private readonly svc: RecommendationsService) {}

  @Get()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  forYou(@CurrentUser() u: { id: string }, @Query() q: ForYouQueryDto) {
    return this.svc.getForYou(u.id, q.limit ?? 8);
  }
}
