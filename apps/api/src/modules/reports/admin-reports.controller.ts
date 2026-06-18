import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt.guard';
import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ListReportsDto } from './dto/list-reports.dto';
import { UpdateReportDto } from './dto/update-report.dto';
import { ReportsService } from './reports.service';

@ApiTags('admin/reports')
@Controller({ path: 'admin/reports', version: '1' })
@UseGuards(JwtAuthGuard)
@Roles(['admin'])
export class AdminReportsController {
  constructor(private readonly svc: ReportsService) {}

  @Get('open-count')
  openCount() {
    return this.svc.getOpenCount();
  }

  @Get()
  list(@Query() dto: ListReportsDto, @Query('page') page = '1', @Query('limit') limit = '20') {
    return this.svc.listForAdmin({
      ...dto,
      page: Math.max(1, Number(page) || 1),
      limit: Math.min(100, Math.max(1, Number(limit) || 20)),
    });
  }

  @Patch(':id')
  update(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateReportDto,
  ) {
    return this.svc.updateStatus(id, dto, user.id);
  }
}
