import { Module } from '@nestjs/common';
import { ChaptersController } from './chapters.controller';
import { ChaptersService } from './chapters.service';
import { QueueModule } from '@/modules/queue/queue.module';

@Module({
  imports: [QueueModule],
  controllers: [ChaptersController],
  providers: [ChaptersService],
})
export class ChaptersModule {}
