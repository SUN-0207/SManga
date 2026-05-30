import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StoriesService } from './stories.service';
import { BulkActionDto } from './dto/bulk-action.dto';
import { ImportStoryBulkDto, ImportStoryDto } from './dto/import-story.dto';
import { ListStoriesDto } from './dto/list-stories.dto';
import { JwtAuthGuard } from '@/common/guards/jwt.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

@ApiTags('stories')
@Controller({ path: 'stories', version: '1' })
export class StoriesController {
  constructor(private readonly stories: StoriesService) {}

  @Get()
  list(@Query() q: ListStoriesDto) {
    return this.stories.list(q.page, q.limit);
  }

  @Get('storage-stats')
  storageStats() {
    return this.stories.storageStats();
  }

  @Get('by-slug/:slug')
  getBySlug(@Param('slug') slug: string) {
    return this.stories.getBySlug(slug);
  }

  @Get('by-slug/:slug/chapters')
  chaptersBySlug(
    @Param('slug') slug: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.stories.chapterListBySlug(
      slug,
      Number(page) || 1,
      Number(pageSize) || 50,
    );
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @Roles(['admin'])
  getById(@Param('id') id: string) {
    return this.stories.getById(id);
  }

  @Get(':id/chapters')
  @UseGuards(JwtAuthGuard)
  @Roles(['admin'])
  adminChapters(@Param('id') id: string) {
    return this.stories.listChaptersByStoryId(id);
  }

  @Post('import')
  @UseGuards(JwtAuthGuard)
  @Roles(['admin'])
  import(@Body() dto: ImportStoryDto, @CurrentUser() u: { id: string }) {
    return this.stories.enqueueImport(dto.url, u.id);
  }

  /**
   * Plan 7: bulk metadata-only import driven by the discover page action bar.
   * Body shape: { urls: string[] } (max 50 unique URLs per call).
   */
  @Post('import-bulk')
  @UseGuards(JwtAuthGuard)
  @Roles(['admin'])
  importBulk(@Body() dto: ImportStoryBulkDto, @CurrentUser() u: { id: string }) {
    return this.stories.enqueueImportBulk(dto.urls, u.id, dto.autoCrawl ?? false);
  }

  /**
   * Plan 7: trigger chapter-list discovery for a metadata-only story.
   * Idempotent via per-story Bull jobId.
   */
  @Post(':id/discover')
  @UseGuards(JwtAuthGuard)
  @Roles(['admin'])
  discoverChapters(@Param('id') id: string, @CurrentUser() u: { id: string }) {
    return this.stories.enqueueDiscoverChapters(id, u.id);
  }

  /**
   * Bulk action over selected story rows on /admin/stories — lets the operator
   * re-trigger discover/crawl across many stubs in one click instead of
   * opening each detail page. Cap 100/call.
   */
  @Post('bulk-action')
  @UseGuards(JwtAuthGuard)
  @Roles(['admin'])
  bulkAction(@Body() dto: BulkActionDto, @CurrentUser() u: { id: string }) {
    return this.stories.enqueueBulkAction(dto.ids, dto.action, u.id);
  }
}
