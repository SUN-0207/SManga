import { Roles } from '@/common/decorators/roles.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt.guard';
import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AppSettingsService } from './app-settings.service';
import { UpdateAutoRetryDto } from './dto/update-auto-retry.dto';

@ApiTags('admin/settings')
@Controller({ path: 'admin/settings/auto-retry', version: '1' })
@UseGuards(JwtAuthGuard)
@Roles(['admin'])
export class AutoRetryController {
  constructor(private readonly settings: AppSettingsService) {}

  @Get()
  get() {
    return this.settings.getAutoRetry();
  }

  @Patch()
  update(@Body() dto: UpdateAutoRetryDto) {
    return this.settings.setAutoRetry(dto.enabled);
  }
}
