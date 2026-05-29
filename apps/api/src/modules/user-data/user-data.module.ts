import { Module } from '@nestjs/common';
import { BookmarksController } from './bookmarks.controller';
import { BookmarksService } from './bookmarks.service';
import { ReadingProgressController } from './reading-progress.controller';
import { ReadingProgressService } from './reading-progress.service';

@Module({
  controllers: [BookmarksController, ReadingProgressController],
  providers: [BookmarksService, ReadingProgressService],
})
export class UserDataModule {}
