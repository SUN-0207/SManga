import { Roles } from '@/common/decorators/roles.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt.guard';
import { Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JobsService } from './jobs.service';

@ApiTags('jobs')
@Controller({ path: 'jobs', version: '1' })
@UseGuards(JwtAuthGuard)
@Roles(['admin'])
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get('stats')
  stats(@Query('fresh') fresh?: string) {
    // `?fresh=true` bypasses the 30s server-side cache. Used by the admin
    // "Làm mới" button so a manual click always sees current numbers. The
    // 15s background poll omits the param so it still benefits from the cache.
    return this.jobs.stats(fresh === 'true' || fresh === '1');
  }

  @Get()
  list() {
    return this.jobs.list();
  }

  @Post(':id/retry')
  retry(@Param('id') id: string) {
    return this.jobs.retry(id);
  }

  @Post('retry-failed')
  retryAllFailed() {
    return this.jobs.retryAllFailed();
  }

  /**
   * One-click re-crawl of every chapter in 'crawled' status. Returns 202
   * Accepted because the work is asynchronous — the Bull queue drains over
   * hours, not within this request.
   */
  @Post('refetch-all-chapters')
  @HttpCode(202)
  refetchAllChapters() {
    return this.jobs.refetchAllChapters();
  }

  /**
   * Fan out an import-story job per stub story (cover_mime_type IS NULL) so
   * the engine's heal path re-downloads each missing cover. 202 Accepted —
   * jobs drain asynchronously via the existing crawler queue.
   */
  @Post('backfill-covers')
  @HttpCode(202)
  backfillCovers() {
    return this.jobs.backfillCovers();
  }

  @Get('dead-letter')
  listDeadLetter(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.jobs.listDeadLetter(Number(page) || 1, Number(pageSize) || 50);
  }

  @Post('dead-letter/retry-all')
  @HttpCode(202)
  deadLetterRetryAll() {
    return this.jobs.deadLetterRetryAll();
  }

  @Post('dead-letter/:id/retry-now')
  deadLetterRetryNow(@Param('id') id: string) {
    return this.jobs.deadLetterRetryNow(id);
  }

  @Post('dead-letter/:id/dismiss')
  deadLetterDismiss(@Param('id') id: string) {
    return this.jobs.deadLetterDismiss(id);
  }
}
