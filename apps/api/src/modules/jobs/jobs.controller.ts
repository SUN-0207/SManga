import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JobsService } from './jobs.service';
import { JwtAuthGuard } from '@/common/guards/jwt.guard';
import { Roles } from '@/common/decorators/roles.decorator';

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
}
