import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt.guard';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { RateStoryDto } from './dto/rate-story.dto';
import { EngagementService } from './engagement.service';

// GET /ratings/* rides the global OptionalJwtGuard — no @UseGuards needed.
// PUT/DELETE /ratings/* require a valid JWT — @UseGuards(JwtAuthGuard) overrides
// the global optional guard for those routes.
@ApiTags('ratings')
@Controller({ path: 'ratings', version: '1' })
export class RatingsController {
  constructor(private readonly svc: EngagementService) {}

  // Anonymous-friendly: mine is null when req.user is absent.
  // Use @CurrentUser() (consistent with rest of codebase) instead of @Request()
  // to avoid hand-typed inline type annotations that may diverge from the JWT payload shape.
  @Get('story/:storyId')
  getRating(
    @Param('storyId', new ParseUUIDPipe()) storyId: string,
    @CurrentUser() user: { id: string } | null,
  ) {
    return this.svc.getRatingAggregate(storyId, user?.id ?? null);
  }

  @Put('story/:storyId')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  upsertRating(
    @Param('storyId', new ParseUUIDPipe()) storyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: RateStoryDto,
  ) {
    return this.svc.upsertRating(storyId, user.id, dto.value);
  }

  @Delete('story/:storyId')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  deleteRating(
    @Param('storyId', new ParseUUIDPipe()) storyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.svc.deleteRating(storyId, user.id);
  }
}
