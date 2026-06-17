import { QueueModule } from '@/modules/queue/queue.module';
import { Module } from '@nestjs/common';
import { JobFailureListener } from './job-failure.listener';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { NotifyNewChaptersService } from './notify-new-chapters.service';
import { RetryReconcilerService } from './retry-reconciler.service';

@Module({
  imports: [QueueModule],
  controllers: [JobsController],
  providers: [JobsService, JobFailureListener, RetryReconcilerService, NotifyNewChaptersService],
})
export class JobsModule {}
