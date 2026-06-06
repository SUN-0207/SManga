import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt.guard';
import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsArray, IsOptional, IsUUID } from 'class-validator';
import type { NotificationsService } from './notifications.service';

class MarkReadDto {
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  ids?: string[];
}

@ApiTags('notifications')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'me/notifications', version: '1' })
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  @Get()
  listNotifications(
    @CurrentUser() user: { id: string },
    @Query('unreadOnly') unreadOnly = 'false',
    @Query('limit') limit = '30',
  ) {
    return this.svc.listNotifications(
      user.id,
      unreadOnly === 'true',
      Math.min(100, Math.max(1, Number(limit))),
    );
  }

  @Post('read')
  @HttpCode(204)
  markRead(@CurrentUser() user: { id: string }, @Body() body: MarkReadDto) {
    return this.svc.markRead(user.id, body.ids);
  }
}
