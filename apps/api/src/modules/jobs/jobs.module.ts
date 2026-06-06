import { QueueModule } from '@/modules/queue/queue.module';
import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  imports: [QueueModule],
  controllers: [JobsController],
  providers: [JobsService],
})
export class JobsModule {}
