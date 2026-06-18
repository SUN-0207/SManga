import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt.guard';
import { RealIpThrottlerGuard } from '@/common/guards/real-ip-throttler.guard';
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CreateReportDto } from './dto/create-report.dto';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@Controller({ path: 'reports', version: '1' })
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly svc: ReportsService) {}

  @Post()
  @UseGuards(RealIpThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateReportDto) {
    return this.svc.create(user.id, dto);
  }
}
