import { AppSettingsModule } from '@/modules/app-settings/app-settings.module';
import { Module } from '@nestjs/common';
import { CultivationController } from './cultivation.controller';
import { CultivationService } from './cultivation.service';

@Module({
  imports: [AppSettingsModule],
  controllers: [CultivationController],
  providers: [CultivationService],
  exports: [CultivationService],
})
export class CultivationModule {}
