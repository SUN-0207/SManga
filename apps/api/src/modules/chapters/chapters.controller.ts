import { Roles } from '@/common/decorators/roles.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt.guard';
import { Body, Controller, Get, Header, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ChaptersService } from './chapters.service';
import { CrawlChaptersDto } from './dto/crawl.dto';

@ApiTags('chapters')
@Controller({ path: 'chapters', version: '1' })
export class ChaptersController {
  constructor(private readonly chapters: ChaptersService) {}

  @Get('by-slug/:slug/:index')
  @Header('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=3600')
  get(@Param('slug') slug: string, @Param('index') index: string) {
    return this.chapters.getChapterContent(slug, index);
  }

  @Post('crawl/:storyId')
  @UseGuards(JwtAuthGuard)
  @Roles(['admin'])
  crawl(@Param('storyId') storyId: string, @Body() dto: CrawlChaptersDto) {
    return this.chapters.crawl(storyId, dto);
  }
}
