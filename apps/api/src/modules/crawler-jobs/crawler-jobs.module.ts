import { QueueModule } from '@/modules/queue/queue.module';
import { StoriesModule } from '@/modules/stories/stories.module';
import { Module } from '@nestjs/common';
import { DiscoverAllSourceProcessor } from './discover-all-source.processor';
import { DiscoverChaptersProcessor } from './discover-chapters.processor';
import { FetchChapterProcessor } from './fetch-chapter.processor';
import { ImportStoryProcessor } from './import-story.processor';

@Module({
  imports: [QueueModule, StoriesModule],
  providers: [
    ImportStoryProcessor,
    DiscoverChaptersProcessor,
    FetchChapterProcessor,
    DiscoverAllSourceProcessor,
  ],
})
export class CrawlerJobsModule {}
