import { Roles } from '@/common/decorators/roles.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt.guard';
import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AppSettingsService } from './app-settings.service';
import { UpdateAutoCrawlDto } from './dto/update-auto-crawl.dto';

@ApiTags('admin/settings')
@Controller({ path: 'admin/settings/auto-crawl', version: '1' })
@UseGuards(JwtAuthGuard)
@Roles(['admin'])
export class AutoCrawlController {
  constructor(private readonly settings: AppSettingsService) {}

  @Get()
  get() {
    return this.settings.getAutoCrawl();
  }

  @Patch()
  update(@Body() dto: UpdateAutoCrawlDto) {
    return this.settings.setAutoCrawl(dto.enabled, dto.watermark, dto.crawlRps);
  }
}
