import { QUEUE_CRAWLER } from '@/modules/queue/queue.constants';
import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { AppSettingsController } from './app-settings.controller';
import { AppSettingsService } from './app-settings.service';
import { AutoRetryController } from './auto-retry.controller';
import { RefreshAllStoriesProcessor } from './refresh-all-stories.processor';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_CRAWLER })],
  controllers: [AppSettingsController, AutoRetryController],
  providers: [AppSettingsService, RefreshAllStoriesProcessor],
  exports: [AppSettingsService],
})
export class AppSettingsModule {}
