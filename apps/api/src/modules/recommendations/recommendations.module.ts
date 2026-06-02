// apps/api/src/modules/recommendations/recommendations.module.ts
import { Module } from '@nestjs/common';
import {
  RecommendationsController,
  MeRecommendationsController,
} from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';

@Module({
  controllers: [RecommendationsController, MeRecommendationsController],
  providers: [RecommendationsService],
})
export class RecommendationsModule {}
