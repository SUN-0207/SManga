import { Module } from '@nestjs/common';
import { QueueModule } from '@/modules/queue/queue.module';
import { ImportStoryProcessor } from './import-story.processor';
import { FetchChapterProcessor } from './fetch-chapter.processor';

@Module({
  imports: [QueueModule],
  providers: [ImportStoryProcessor, FetchChapterProcessor],
})
export class CrawlerJobsModule {}
