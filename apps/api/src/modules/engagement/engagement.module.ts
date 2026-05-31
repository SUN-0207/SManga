import { Module } from '@nestjs/common';
import { EngagementService } from './engagement.service';
import { ViewsController } from './views.controller';
import { RatingsController } from './ratings.controller';

@Module({
  controllers: [ViewsController, RatingsController],
  providers:   [EngagementService],
})
export class EngagementModule {}
