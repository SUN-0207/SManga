import { loadEnv } from '@/config/env';
import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { QUEUE_CRAWLER } from './queue.constants';

@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: () => {
        const url = new URL(loadEnv().REDIS_URL);
        // Managed Redis providers expose rediss:// (TLS) on 6379. ioredis
        // defaults to plain TCP unless `tls` is an object, so we MUST set
        // it when the scheme is `rediss:` — otherwise the socket handshake
        // hangs forever and every Bull op blocks indefinitely. Local Redis
        // (current laptop self-host) uses plain redis:// so the branch is a
        // no-op; the workaround stays in case the deploy target ever flips
        // back to a managed TLS-only provider.
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
            // Keep last 20k completed jobs (7 days). A single story with ~1000
            // chapters previously hit the old cap of 1000 and made the
            // "Hoàn thành" stat look stuck — bump it so the dashboard reflects
            // real progress across multiple stories. Trimming still applies so
            // Redis memory stays bounded.
            removeOnComplete: { age: 7 * 86_400, count: 20_000 },
            // Bound the failed set too. `false` lets failed jobs accumulate
            // forever — under the 2026-06-09 scaling load (3.7M waiting +
            // steady retry traffic), the failed ZSET kept growing and every
            // Bull stalled-check / failed-bucket read got slower. Keep the
            // last 24h × 5k for operator forensics; older entries trim. The
            // "Retry tất cả thất bại" admin button still works on whatever
            // is in the bucket at the moment.
            removeOnFail: { age: 86_400, count: 5_000 },
          },
        };
      },
    }),
    BullModule.registerQueue({ name: QUEUE_CRAWLER }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
