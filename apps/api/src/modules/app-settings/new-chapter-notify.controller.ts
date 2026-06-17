import { Roles } from '@/common/decorators/roles.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt.guard';
import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AppSettingsService } from './app-settings.service';
import { UpdateNewChapterNotifyDto } from './dto/update-new-chapter-notify.dto';

@ApiTags('admin/settings')
@Controller({ path: 'admin/settings/new-chapter-notify', version: '1' })
@UseGuards(JwtAuthGuard)
@Roles(['admin'])
export class NewChapterNotifyController {
  constructor(private readonly settings: AppSettingsService) {}

  @Get()
  get() {
    return this.settings.getNewChapterNotify();
  }

  @Patch()
  update(@Body() dto: UpdateNewChapterNotifyDto) {
    return this.settings.setNewChapterNotify(dto.enabled);
  }
}
