import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SourcesService } from './sources.service';
import { CreateSourceDto, UpdateSourceDto } from './dto/create-source.dto';
import { JwtAuthGuard } from '@/common/guards/jwt.guard';
import { Roles } from '@/common/decorators/roles.decorator';

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
}
