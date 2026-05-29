import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ReadingProgressService } from './reading-progress.service';
import { ReadingProgressDto } from './dto/reading-progress.dto';
import { JwtAuthGuard } from '@/common/guards/jwt.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

@ApiTags('reading-progress')
@Controller({ path: 'me/reading-progress', version: '1' })
@UseGuards(JwtAuthGuard)
export class ReadingProgressController {
  constructor(private readonly svc: ReadingProgressService) {}

  @Get()
  list(@CurrentUser() u: { id: string }) {
    return this.svc.list(u.id);
  }

  @Put()
  upsert(@CurrentUser() u: { id: string }, @Body() dto: ReadingProgressDto) {
    return this.svc.upsert(u.id, dto.storyId, dto.chapterIndex);
  }
}
