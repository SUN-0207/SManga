import { Module } from '@nestjs/common';
import { SourcesController } from './sources.controller';
import { SourcesService } from './sources.service';
import { QueueModule } from '@/modules/queue/queue.module';

@Module({
  imports: [QueueModule],
  controllers: [SourcesController],
  providers: [SourcesService],
})
export class SourcesModule {}
