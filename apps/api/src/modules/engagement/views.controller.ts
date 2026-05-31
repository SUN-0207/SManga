import { Controller, HttpCode, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { EngagementService } from './engagement.service';

// ThrottlerModule is globally wired at 120/min in app.module.ts.
// View endpoints are tightened to 30/min per IP to bound F5 spam.
@ApiTags('views')
@Controller({ path: 'views', version: '1' })
export class ViewsController {
  constructor(private readonly svc: EngagementService) {}

  @Post('story/:storyId')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(204)
  incrementStoryView(@Param('storyId') storyId: string): Promise<void> {
    return this.svc.incrementStoryView(storyId);
  }

  @Post('chapter/:chapterId')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(204)
  incrementChapterView(@Param('chapterId') chapterId: string): Promise<void> {
    return this.svc.incrementChapterView(chapterId);
  }
}
