import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt.guard';
import { Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CultivationService } from './cultivation.service';

@ApiTags('cultivation')
@Controller({ path: 'me', version: '1' })
@UseGuards(JwtAuthGuard)
export class CultivationController {
  constructor(private readonly svc: CultivationService) {}

  @Get('cultivation')
  getCultivation(@CurrentUser() u: { id: string }) {
    return this.svc.getState(u.id);
  }

  @Post('checkin')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  checkin(@CurrentUser() u: { id: string }) {
    return this.svc.checkin(u.id);
  }
}
