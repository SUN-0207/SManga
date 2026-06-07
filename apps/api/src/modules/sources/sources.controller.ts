import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt.guard';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type {
  CreateSourceDto,
  DiscoverAllSourceDto,
  UpdateSourceDto,
} from './dto/create-source.dto';
import { SourcesService } from './sources.service';

@ApiTags('sources')
@Controller({ path: 'sources', version: '1' })
@UseGuards(JwtAuthGuard)
@Roles(['admin'])
export class SourcesController {
  constructor(private readonly sources: SourcesService) {}

  @Get()
  list() {
    return this.sources.list();
  }

  @Post()
  create(@Body() dto: CreateSourceDto) {
    return this.sources.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSourceDto) {
    return this.sources.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.sources.remove(id);
  }

  @Get(':id/feeds')
  feeds(@Param('id') id: string) {
    return this.sources.feeds(id);
  }

  @Get(':id/discover')
  discover(
    @Param('id') id: string,
    @Query('feed') feed?: string,
    @Query('page') page?: string,
    @Query('q') q?: string,
  ) {
    const pageNum = Math.max(1, Number(page) || 1);
    return this.sources.discover(id, feed, pageNum, q);
  }

  /**
   * Plan crawl-all — queue a full-feed import for the given source.
   * Returns 202 Accepted with { jobId }.
   * Returns 409 if the same (sourceId, feedId) job is already active.
   */
  @Post(':id/discover-all')
  @HttpCode(HttpStatus.ACCEPTED)
  discoverAll(
    @Param('id') id: string,
    @Body() dto: DiscoverAllSourceDto,
    @CurrentUser() u: { id: string },
  ) {
    return this.sources.enqueueDiscoverAll(id, dto.feed, dto.autoCrawl ?? false, u.id);
  }
}
