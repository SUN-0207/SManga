import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerModule } from '@nestjs/throttler';
import '@smanga/crawler'; // side effect: register adapters
import { DbModule } from './modules/db/db.module';
import { QueueModule } from './modules/queue/queue.module';
import { CrawlerJobsModule } from './modules/crawler-jobs/crawler-jobs.module';
import { AuthModule } from './modules/auth/auth.module';
import { SourcesModule } from './modules/sources/sources.module';
import { StoriesModule } from './modules/stories/stories.module';
import { ChaptersModule } from './modules/chapters/chapters.module';
import { CoversModule } from './modules/covers/covers.module';
import { JobsModule } from './modules/jobs/jobs.module';

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
    SourcesModule,
    StoriesModule,
    ChaptersModule,
    CoversModule,
    JobsModule,
  ],
})
export class AppModule {}
