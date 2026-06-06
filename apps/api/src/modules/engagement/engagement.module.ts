import { Module } from '@nestjs/common';
import { EngagementService } from './engagement.service';
import { RatingsController } from './ratings.controller';
import { ViewsController } from './views.controller';

@Module({
  controllers: [ViewsController, RatingsController],
  providers: [EngagementService],
})
export class EngagementModule {}
