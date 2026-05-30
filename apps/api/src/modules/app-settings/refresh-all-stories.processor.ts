import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { Inject, Logger } from '@nestjs/common';
import type { Job, Queue } from 'bull';
import { and, eq } from 'drizzle-orm';
import { appSetting, story } from '@smanga/db/schema';
import type { Database } from '@smanga/db';
import { DRIZZLE } from '@/modules/db/db.provider';
import {
  JOB_DISCOVER_CHAPTERS,
  JOB_REFRESH_ALL_STORIES,
  QUEUE_CRAWLER,
  type DiscoverChaptersJobData,
} from '@/modules/queue/queue.constants';
import { AppSettingsService } from './app-settings.service';

@Processor(QUEUE_CRAWLER)
export class RefreshAllStoriesProcessor {
  private readonly logger = new Logger(RefreshAllStoriesProcessor.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @InjectQueue(QUEUE_CRAWLER) private readonly queue: Queue,
    private readonly settings: AppSettingsService,
  ) {}

  /**
   * Fan-out from the scheduled (or manual) trigger: for every eligible story,
   * enqueue a discover-chapters job with autoCrawl=true so the existing chain
   * picks up new chapters and crawls them. Idempotent via per-story Bull jobId.
   */
  @Process(JOB_REFRESH_ALL_STORIES)
  async handle(job: Job): Promise<{ enqueued: number; skipped: number }> {
    const [config] = await this.db.select().from(appSetting).where(eq(appSetting.id, 1)).limit(1);
    if (!config) {
      this.logger.warn(`refresh-all-stories ${job.id} aborted — app_setting row missing`);
      return { enqueued: 0, skipped: 0 };
    }
    const manual = (job.data as { manual?: boolean } | undefined)?.manual ?? false;
    if (!manual && !config.autoRefreshEnabled) {
      this.logger.log(`refresh-all-stories ${job.id} skipped — auto refresh disabled`);
      return { enqueued: 0, skipped: 0 };
    }

    // Eligible: discovery already complete (so we have a chapter list baseline),
    // not opted out via per-story toggle. Scope='ongoing' further narrows to
    // status='ongoing' so dropped/completed stories don't waste rate-limit budget.
    const baseConds = [
      eq(story.discoveryStatus, 'complete'),
      eq(story.autoRefresh, true),
    ];
    if (config.autoRefreshScope === 'ongoing') {
      baseConds.push(eq(story.status, 'ongoing'));
    }
    const rows = await this.db
      .select({ id: story.id })
      .from(story)
      .where(and(...baseConds));

    let enqueued = 0;
    let skipped = 0;
    for (const r of rows) {
      try {
        const payload: DiscoverChaptersJobData = {
          storyId: r.id,
          requestedBy: null,
          autoCrawl: true,
        };
        await this.queue.add(JOB_DISCOVER_CHAPTERS, payload, {
          jobId: `discover-chapters:${r.id}`,
        });
        enqueued += 1;
      } catch {
        // Idempotent jobId collision (a discovery already running) → skip silently.
        skipped += 1;
      }
    }

    await this.settings.markRunResult(enqueued);
    this.logger.log(
      `refresh-all-stories ${job.id} done — enqueued=${enqueued} skipped=${skipped} manual=${manual}`,
    );
    return { enqueued, skipped };
  }
}
