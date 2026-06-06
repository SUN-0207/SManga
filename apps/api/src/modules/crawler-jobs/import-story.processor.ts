import { DRIZZLE } from '@/modules/db/db.provider';
import {
  type DiscoverChaptersJobData,
  type ImportStoryJobData,
  JOB_DISCOVER_CHAPTERS,
  JOB_IMPORT_STORY,
  QUEUE_CRAWLER,
} from '@/modules/queue/queue.constants';
import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { Inject, Logger } from '@nestjs/common';
import { importStory, importStoryMetadata } from '@smanga/crawler';
import type { Database } from '@smanga/db';
import type { Job, Queue } from 'bull';

@Processor(QUEUE_CRAWLER)
export class ImportStoryProcessor {
  private readonly logger = new Logger(ImportStoryProcessor.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @InjectQueue(QUEUE_CRAWLER) private readonly queue: Queue,
  ) {}

  @Process(JOB_IMPORT_STORY)
  async handle(job: Job<ImportStoryJobData>): Promise<void> {
    const { url, skipDiscovery, autoCrawl, requestedBy } = job.data;
    this.logger.log(
      `import-story start ${job.id} url=${url} skipDiscovery=${skipDiscovery ?? false} autoCrawl=${autoCrawl ?? false}`,
    );

    if (skipDiscovery) {
      const { storyId, alreadyExisted } = await importStoryMetadata(this.db, url);
      this.logger.log(
        `import-story done ${job.id} storyId=${storyId} alreadyExisted=${alreadyExisted} (metadata only)`,
      );
      if (autoCrawl) {
        const payload: DiscoverChaptersJobData = { storyId, requestedBy, autoCrawl: true };
        await this.queue.add(JOB_DISCOVER_CHAPTERS, payload, {
          jobId: `discover-chapters:${storyId}`,
        });
        this.logger.log(`import-story chained discover-chapters for ${storyId} (autoCrawl)`);
      }
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
