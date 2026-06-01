import { Module } from '@nestjs/common';
import { StoriesController } from './stories.controller';
import { StoriesService } from './stories.service';
import { QueueModule } from '@/modules/queue/queue.module';

@Module({
  imports: [QueueModule],
  controllers: [StoriesController],
  providers: [StoriesService],
  exports: [StoriesService],
})
export class StoriesModule {}
