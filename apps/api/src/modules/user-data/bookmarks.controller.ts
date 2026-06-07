import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt.guard';
import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BookmarksService } from './bookmarks.service';
import { BookmarkDto } from './dto/bookmark.dto';

@ApiTags('bookmarks')
@Controller({ path: 'me/bookmarks', version: '1' })
@UseGuards(JwtAuthGuard)
export class BookmarksController {
  constructor(private readonly svc: BookmarksService) {}

  @Get()
  list(@CurrentUser() u: { id: string }) {
    return this.svc.list(u.id);
  }

  @Get(':storyId')
  has(@CurrentUser() u: { id: string }, @Param('storyId') storyId: string) {
    return this.svc.has(u.id, storyId);
  }

  @Post()
  add(@CurrentUser() u: { id: string }, @Body() dto: BookmarkDto) {
    return this.svc.add(u.id, dto.storyId);
  }

  @Delete(':storyId')
  remove(@CurrentUser() u: { id: string }, @Param('storyId') storyId: string) {
    return this.svc.remove(u.id, storyId);
  }
}
