import { Roles } from '@/common/decorators/roles.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt.guard';
import { Body, Controller, Get, HttpCode, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AppSettingsService } from './app-settings.service';
import type { UpdateAutoRefreshDto } from './dto/update-auto-refresh.dto';

@ApiTags('admin/settings')
@Controller({ path: 'admin/settings/auto-refresh', version: '1' })
@UseGuards(JwtAuthGuard)
@Roles(['admin'])
export class AppSettingsController {
  constructor(private readonly settings: AppSettingsService) {}

  @Get()
  get() {
    return this.settings.get();
  }

  @Patch()
  update(@Body() dto: UpdateAutoRefreshDto) {
    return this.settings.update(dto);
  }

  @Post('run-now')
  @HttpCode(202)
  runNow() {
    return this.settings.runNow();
  }
}
