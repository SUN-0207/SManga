import { QUEUE_CRAWLER } from '@/modules/queue/queue.constants';
import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { AppSettingsController } from './app-settings.controller';
import { AppSettingsService } from './app-settings.service';
import { AutoCrawlFeederProcessor } from './auto-crawl-feeder.processor';
import { AutoCrawlController } from './auto-crawl.controller';
import { AutoRetryController } from './auto-retry.controller';
import { GamificationController } from './gamification.controller';
import { NewChapterNotifyController } from './new-chapter-notify.controller';
import { RefreshAllStoriesProcessor } from './refresh-all-stories.processor';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_CRAWLER })],
  controllers: [
    AppSettingsController,
    AutoRetryController,
    AutoCrawlController,
    NewChapterNotifyController,
    GamificationController,
  ],
  providers: [AppSettingsService, RefreshAllStoriesProcessor, AutoCrawlFeederProcessor],
  exports: [AppSettingsService],
})
export class AppSettingsModule {}
