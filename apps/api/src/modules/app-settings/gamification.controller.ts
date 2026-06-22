import { Roles } from '@/common/decorators/roles.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt.guard';
import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AppSettingsService } from './app-settings.service';
import { UpdateGamificationDto } from './dto/update-gamification.dto';

@ApiTags('admin/settings')
@Controller({ path: 'admin/settings/gamification', version: '1' })
@UseGuards(JwtAuthGuard)
@Roles(['admin'])
export class GamificationController {
  constructor(private readonly settings: AppSettingsService) {}

  @Get()
  get() {
    return this.settings.getGamification();
  }

  @Patch()
  update(@Body() dto: UpdateGamificationDto) {
    return this.settings.setGamification(dto.enabled);
  }
}
