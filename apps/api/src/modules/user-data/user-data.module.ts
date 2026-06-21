import { CultivationModule } from '@/modules/cultivation/cultivation.module';
import { Module } from '@nestjs/common';
import { BookmarksController } from './bookmarks.controller';
import { BookmarksService } from './bookmarks.service';
import { ReadingProgressController } from './reading-progress.controller';
import { ReadingProgressService } from './reading-progress.service';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

@Module({
  imports: [CultivationModule],
  controllers: [BookmarksController, ReadingProgressController, StatsController],
  providers: [BookmarksService, ReadingProgressService, StatsService],
})
export class UserDataModule {}
