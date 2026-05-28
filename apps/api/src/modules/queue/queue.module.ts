import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { loadEnv } from '@/config/env';
import { QUEUE_CRAWLER } from './queue.constants';

@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: () => {
        const url = new URL(loadEnv().REDIS_URL);
        return {
          redis: {
            host: url.hostname,
            port: Number(url.port || 6379),
            password: url.password || undefined,
          },
          defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 30_000 },
            removeOnComplete: { age: 86_400, count: 1000 },
            removeOnFail: false,
          },
        };
      },
    }),
    BullModule.registerQueue({ name: QUEUE_CRAWLER }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
