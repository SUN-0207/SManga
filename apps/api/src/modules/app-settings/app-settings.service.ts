import { DRIZZLE } from '@/modules/db/db.provider';
import { assertQueueCapacity } from '@/modules/queue/queue-capacity';
import {
  JOB_PRIORITY,
  JOB_REFRESH_ALL_STORIES,
  QUEUE_CRAWLER,
} from '@/modules/queue/queue.constants';
import { withRedisReadyRetry } from '@/modules/queue/redis-ready';
import { InjectQueue } from '@nestjs/bull';
import { BadRequestException, Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { rateGovernor } from '@smanga/crawler';
import type { Database } from '@smanga/db';
import { appSetting } from '@smanga/db/schema';
import type { Queue } from 'bull';
import { CronExpressionParser } from 'cron-parser';
import { eq } from 'drizzle-orm';
import { UpdateAutoRefreshDto } from './dto/update-auto-refresh.dto';

const REPEATABLE_KEY = 'refresh-all-stories-cron';

@Injectable()
export class AppSettingsService implements OnModuleInit {
  private readonly logger = new Logger(AppSettingsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @InjectQueue(QUEUE_CRAWLER) private readonly queue: Queue,
  ) {}

  /**
   * Sync Bull's repeatable-job registry with the persisted setting at boot.
   * The old repeatable (if any) is always removed first, then re-added with
   * the current cron — covers both cron-changes-while-down and "delete the
   * job by toggling off → restart" paths in a single code path.
   */
  async onModuleInit() {
    const setting = await this.getOrSeed();
    await this.syncRepeatable(setting.autoRefreshEnabled, setting.autoRefreshCron);
    // Seed the crawl-rate governor from persisted config so the very first
    // crawl after a (re)boot already runs at the operator's chosen rps.
    rateGovernor.setGlobalRps(setting.crawlRps);
  }

  async get() {
    return this.getOrSeed();
  }

  async update(dto: UpdateAutoRefreshDto) {
    if (dto.cron !== undefined) {
      try {
        CronExpressionParser.parse(dto.cron);
      } catch (err) {
        throw new BadRequestException(`Cron không hợp lệ: ${(err as Error).message}`);
      }
    }
    const patch: Partial<typeof appSetting.$inferInsert> = { updatedAt: new Date() };
    if (dto.enabled !== undefined) patch.autoRefreshEnabled = dto.enabled;
    if (dto.cron !== undefined) patch.autoRefreshCron = dto.cron;
    if (dto.scope !== undefined) patch.autoRefreshScope = dto.scope;
    if (dto.concurrency !== undefined) patch.autoRefreshConcurrency = dto.concurrency;

    const [updated] = await this.db
      .update(appSetting)
      .set(patch)
      .where(eq(appSetting.id, 1))
      .returning();
    if (!updated) throw new BadRequestException('app_setting row missing — re-run migration 0007');
    await this.syncRepeatable(updated.autoRefreshEnabled, updated.autoRefreshCron);
    return updated;
  }

  /**
   * Fire one refresh-all job immediately, independent of the cron schedule.
   * Useful for a "Chạy ngay" admin button. Returns the Bull job ID so the
   * UI can link into /admin/jobs to watch it.
   */
  async runNow() {
    await assertQueueCapacity(this.queue);
    const job = await this.queue.add(
      JOB_REFRESH_ALL_STORIES,
      { manual: true },
      { priority: JOB_PRIORITY.REFRESH_ALL_STORIES },
    );
    return { jobId: String(job.id) };
  }

  async markRunResult(count: number) {
    await this.db
      .update(appSetting)
      .set({ lastRunAt: new Date(), lastRunCount: count })
      .where(eq(appSetting.id, 1));
  }

  async getAutoRetry(): Promise<{ autoRetryEnabled: boolean }> {
    const s = await this.getOrSeed();
    return { autoRetryEnabled: s.autoRetryEnabled };
  }

  async setAutoRetry(enabled: boolean): Promise<{ autoRetryEnabled: boolean }> {
    const [updated] = await this.db
      .update(appSetting)
      .set({ autoRetryEnabled: enabled, updatedAt: new Date() })
      .where(eq(appSetting.id, 1))
      .returning();
    if (!updated) throw new BadRequestException('app_setting row missing — re-run migrations');
    return { autoRetryEnabled: updated.autoRetryEnabled };
  }

  async getAutoCrawl(): Promise<{
    autoCrawlEnabled: boolean;
    autoCrawlWatermark: number;
    crawlRps: number;
  }> {
    const s = await this.getOrSeed();
    return {
      autoCrawlEnabled: s.autoCrawlEnabled,
      autoCrawlWatermark: s.autoCrawlWatermark,
      crawlRps: s.crawlRps,
    };
  }

  async setAutoCrawl(
    enabled: boolean,
    watermark: number,
    crawlRps: number,
  ): Promise<{ autoCrawlEnabled: boolean; autoCrawlWatermark: number; crawlRps: number }> {
    // Clamp defensively even though the DTO validates — these are load-bearing
    // safety knobs; never let them be 0 or absurdly large.
    const clampedWatermark = Math.min(2000, Math.max(50, Math.floor(watermark)));
    const clampedRps = Math.min(20, Math.max(0.1, crawlRps));
    const [updated] = await this.db
      .update(appSetting)
      .set({
        autoCrawlEnabled: enabled,
        autoCrawlWatermark: clampedWatermark,
        crawlRps: clampedRps,
        updatedAt: new Date(),
      })
      .where(eq(appSetting.id, 1))
      .returning();
    if (!updated) throw new BadRequestException('app_setting row missing — re-run migrations');
    // Push the live rate to the in-process governor so the engine picks it up
    // immediately (no redeploy, no polling).
    rateGovernor.setGlobalRps(updated.crawlRps);
    return {
      autoCrawlEnabled: updated.autoCrawlEnabled,
      autoCrawlWatermark: updated.autoCrawlWatermark,
      crawlRps: updated.crawlRps,
    };
  }

  async getGamificationEnabled(): Promise<boolean> {
    const s = await this.getOrSeed();
    return s.gamificationEnabled;
  }

  async getNewChapterNotify(): Promise<{ newChapterNotifyEnabled: boolean }> {
    const s = await this.getOrSeed();
    return { newChapterNotifyEnabled: s.newChapterNotifyEnabled };
  }

  async setNewChapterNotify(enabled: boolean): Promise<{ newChapterNotifyEnabled: boolean }> {
    const [updated] = await this.db
      .update(appSetting)
      .set({ newChapterNotifyEnabled: enabled, updatedAt: new Date() })
      .where(eq(appSetting.id, 1))
      .returning();
    if (!updated) throw new BadRequestException('app_setting row missing — re-run migrations');
    return { newChapterNotifyEnabled: updated.newChapterNotifyEnabled };
  }

  private async getOrSeed() {
    const [row] = await this.db.select().from(appSetting).where(eq(appSetting.id, 1)).limit(1);
    if (row) return row;
    const [created] = await this.db.insert(appSetting).values({ id: 1 }).returning();
    return created!;
  }

  private async syncRepeatable(enabled: boolean, cron: string) {
    // Remove any prior repeatable registration so we don't end up with
    // duplicate firings after a cron change. Bull keys repeatables by
    // (name, cron, jobId) so a simple remove-by-jobId catches our entry.
    try {
      const repeatables = await this.queue.getRepeatableJobs();
      for (const r of repeatables) {
        if (r.id === REPEATABLE_KEY) {
          await this.queue.removeRepeatableByKey(r.key);
        }
      }
    } catch (err) {
      this.logger.warn(`Failed to clean repeatables: ${(err as Error).message}`);
    }

    if (!enabled) {
      this.logger.log('auto-refresh disabled — no repeatable installed');
      return;
    }

    // Retry while Redis is still LOADING after a co-restart so a boot-time
    // install can't crash the API process (see redis-ready.ts). On the runtime
    // (PATCH) path Redis is already up, so this runs once.
    await withRedisReadyRetry(
      () =>
        this.queue.add(
          JOB_REFRESH_ALL_STORIES,
          {},
          {
            repeat: { cron, tz: 'Asia/Ho_Chi_Minh' },
            jobId: REPEATABLE_KEY,
            priority: JOB_PRIORITY.REFRESH_ALL_STORIES,
          },
        ),
      { logger: this.logger, label: 'auto-refresh repeatable install' },
    );
    this.logger.log(`auto-refresh repeatable installed cron="${cron}" tz=Asia/Ho_Chi_Minh`);
  }
}
