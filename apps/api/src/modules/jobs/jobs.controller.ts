import { Roles } from '@/common/decorators/roles.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt.guard';
import { Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JobsService } from './jobs.service';

@ApiTags('jobs')
@Controller({ path: 'jobs', version: '1' })
@UseGuards(JwtAuthGuard)
@Roles(['admin'])
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get('stats')
  stats() {
    return this.jobs.stats();
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
}
