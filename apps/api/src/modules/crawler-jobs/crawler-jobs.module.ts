import { Module } from '@nestjs/common';
import { QueueModule } from '@/modules/queue/queue.module';
import { ImportStoryProcessor } from './import-story.processor';
import { DiscoverChaptersProcessor } from './discover-chapters.processor';
import { FetchChapterProcessor } from './fetch-chapter.processor';

@Module({
  imports: [QueueModule],
  providers: [ImportStoryProcessor, DiscoverChaptersProcessor, FetchChapterProcessor],
})
export class CrawlerJobsModule {}
