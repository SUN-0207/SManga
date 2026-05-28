import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerModule } from '@nestjs/throttler';
import '@smanga/crawler'; // side effect: register adapters
import { DbModule } from './modules/db/db.module';
import { QueueModule } from './modules/queue/queue.module';
import { CrawlerJobsModule } from './modules/crawler-jobs/crawler-jobs.module';
import { AuthModule } from './modules/auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : { target: 'pino-pretty', options: { colorize: true } },
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    DbModule,
    QueueModule,
    CrawlerJobsModule,
    AuthModule,
  ],
})
export class AppModule {}
