import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { AppSettingsController } from './app-settings.controller';
import { AppSettingsService } from './app-settings.service';
import { RefreshAllStoriesProcessor } from './refresh-all-stories.processor';
import { QUEUE_CRAWLER } from '@/modules/queue/queue.constants';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_CRAWLER })],
  controllers: [AppSettingsController],
  providers: [AppSettingsService, RefreshAllStoriesProcessor],
  exports: [AppSettingsService],
})
export class AppSettingsModule {}
