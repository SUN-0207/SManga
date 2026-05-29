import { Process, Processor } from '@nestjs/bull';
import { Inject, Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { discoverChapters, importStory, importStoryMetadata } from '@smanga/crawler';
import type { Database } from '@smanga/db';
import { DRIZZLE } from '@/modules/db/db.provider';
import {
  JOB_IMPORT_STORY,
  QUEUE_CRAWLER,
  type ImportStoryJobData,
} from '@/modules/queue/queue.constants';

@Processor(QUEUE_CRAWLER)
export class ImportStoryProcessor {
  private readonly logger = new Logger(ImportStoryProcessor.name);

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Process(JOB_IMPORT_STORY)
  async handle(job: Job<ImportStoryJobData>): Promise<void> {
    const { url, skipDiscovery } = job.data;
    this.logger.log(`import-story start ${job.id} url=${url} skipDiscovery=${skipDiscovery ?? false}`);

    if (skipDiscovery) {
      const { storyId, alreadyExisted } = await importStoryMetadata(this.db, url);
      this.logger.log(
        `import-story done ${job.id} storyId=${storyId} alreadyExisted=${alreadyExisted} (metadata only)`,
      );
      return;
    }

    // Legacy path: full A+B composite (kept for CLI + single-URL admin import).
    // discoverChapters is called via importStory's composite so a partial failure
    // (metadata persisted but chapter discovery threw) still leaves the story
    // row with discoveryStatus='failed' for retry from the admin UI.
    try {
      const result = await importStory(this.db, url);
      this.logger.log(
        `import-story done ${job.id} storyId=${result.storyId} chapters=${result.totalChapters}`,
      );
    } catch (err) {
      this.logger.error(`import-story failed ${job.id}: ${(err as Error).message}`);
      throw err;
    }
  }
}
