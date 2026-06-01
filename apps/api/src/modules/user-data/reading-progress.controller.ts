import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { ReadingProgressService } from './reading-progress.service';
import { ReadingProgressDto } from './dto/reading-progress.dto';
import { SessionSecondsDto } from './dto/session-seconds.dto';
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

  @Get('continue-reading')
  async continueReading(
    @CurrentUser() u: { id: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const row = await this.svc.getContinueReading(u.id);
    if (!row) {
      res.status(HttpStatus.NO_CONTENT);
      return;
    }
    return row;
  }

  @Put()
  upsert(@CurrentUser() u: { id: string }, @Body() dto: ReadingProgressDto) {
    return this.svc.upsert(u.id, dto.storyId, dto.chapterIndex);
  }

  @Post('session')
  @HttpCode(204)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  addSession(@CurrentUser() u: { id: string }, @Body() dto: SessionSecondsDto) {
    return this.svc.addSession(u.id, dto);
  }
}
