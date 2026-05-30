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
import { SearchModule } from './modules/search/search.module';
import { UserDataModule } from './modules/user-data/user-data.module';
import { UsersModule } from './modules/users/users.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Repo root .env (monorepo single source of truth). On Railway env vars are
      // injected directly, so a missing file is fine — `ignoreEnvFile` not needed
      // because dotenv silently skips when the file isn't present.
      envFilePath: ['../../.env'],
    }),
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
    SearchModule,
    UserDataModule,
    UsersModule,
    HealthModule,
  ],
})
export class AppModule {}
