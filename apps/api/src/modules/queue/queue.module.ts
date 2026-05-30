import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { loadEnv } from '@/config/env';
import { QUEUE_CRAWLER } from './queue.constants';

@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: () => {
        const url = new URL(loadEnv().REDIS_URL);
        // Upstash and other managed Redis exposes rediss:// (TLS) on the
        // standard 6379 port. ioredis defaults to plain TCP unless `tls` is
        // an object, so we MUST set it when the scheme is `rediss:` —
        // otherwise the socket handshake hangs forever and every Bull op
        // (queue.add, getJobCounts, getJobs) blocks indefinitely.
        const isTls = url.protocol === 'rediss:';
        return {
          redis: {
            host: url.hostname,
            port: Number(url.port || 6379),
            username: url.username || undefined,
            password: url.password || undefined,
            ...(isTls ? { tls: { servername: url.hostname } } : {}),
            // ioredis: keep trying on transient blips instead of failing the
            // first command after a Bull restart.
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
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
