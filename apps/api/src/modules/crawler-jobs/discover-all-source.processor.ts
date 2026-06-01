// apps/api/src/modules/crawler-jobs/discover-all-source.processor.ts

import { Process, Processor } from '@nestjs/bull';
import { BadRequestException, ConflictException, Inject, Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { browseCatalog, getAdapter } from '@smanga/crawler';
import type { Database } from '@smanga/db';
import { DRIZZLE } from '@/modules/db/db.provider';
import {
  JOB_DISCOVER_ALL_SOURCE,
  QUEUE_CRAWLER,
  type DiscoverAllSourceJobData,
} from '@/modules/queue/queue.constants';
import { StoriesService } from '@/modules/stories/stories.service';

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

@Processor(QUEUE_CRAWLER)
export class DiscoverAllSourceProcessor {
  private readonly logger = new Logger(DiscoverAllSourceProcessor.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly stories: StoriesService,
  ) {}

  @Process(JOB_DISCOVER_ALL_SOURCE)
  async handle(job: Job<DiscoverAllSourceJobData>): Promise<{ totalQueued: number; pagesCrawled: number }> {
    const { sourceId, feedId, autoCrawl, requestedBy } = job.data;
    this.logger.log(
      `discover-all-source start ${job.id} source=${sourceId} feed=${feedId} autoCrawl=${autoCrawl}`,
    );

    // Validate adapter still resolves (cheap — synchronous registry lookup)
    getAdapter(sourceId);

    let page = 1;
    let totalQueued = 0;

    while (true) {
      const browse = await browseCatalog(this.db, sourceId, feedId, page);

      for (const item of browse.items) {
        try {
          await this.stories.enqueueImport(item.externalUrl, requestedBy);
          totalQueued++;
        } catch (err) {
          // Note on dedup: slug-uniqueness is enforced at the DB layer inside
          // `importStory` (Drizzle unique constraint), not via NestJS ConflictException.
          // The `enqueueImport` call itself does not throw ConflictException for
          // duplicates — it simply enqueues a Bull job, and the importStory processor
          // handles existing stories internally (idempotent). So the ConflictException
          // branch below is defensive and may never trigger via the dedup path.
          //
          // BadRequestException = hostname not registered in adapter registry — skip this
          // story URL silently rather than failing the whole job.
          if (err instanceof ConflictException || err instanceof BadRequestException) {
            this.logger.log(`discover-all-source skip url=${item.externalUrl} reason=${(err as Error).message}`);
            continue;
          }
          // Any other error (DB down, network failure, etc.) surfaces as job failure.
          this.logger.error(
            `discover-all-source enqueueImport failed url=${item.externalUrl}: ${(err as Error).message}`,
          );
          throw err;
        }
      }

      await job.progress({ page, totalQueued, hasNextPage: browse.hasNextPage });
      this.logger.log(
        `discover-all-source page=${page} queued=${totalQueued} hasNextPage=${browse.hasNextPage}`,
      );

      if (!browse.hasNextPage) break;
      page++;
      await sleep(1000);
    }

    this.logger.log(
      `discover-all-source done ${job.id} source=${sourceId} feed=${feedId} totalQueued=${totalQueued} pagesCrawled=${page}`,
    );
    return { totalQueued, pagesCrawled: page };
  }
}
