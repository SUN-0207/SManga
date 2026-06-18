import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import '@smanga/crawler'; // side effect: register adapters
import { AppSettingsModule } from './modules/app-settings/app-settings.module';
import { AuthModule } from './modules/auth/auth.module';
import { ChaptersModule } from './modules/chapters/chapters.module';
import { CommentsModule } from './modules/comments/comments.module';
import { CoversModule } from './modules/covers/covers.module';
import { CrawlerJobsModule } from './modules/crawler-jobs/crawler-jobs.module';
import { DbModule } from './modules/db/db.module';
import { EngagementModule } from './modules/engagement/engagement.module';
import { GenresModule } from './modules/genres/genres.module';
import { HealthModule } from './modules/health/health.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { QueueModule } from './modules/queue/queue.module';
import { RankingsModule } from './modules/rankings/rankings.module';
import { RecommendationsModule } from './modules/recommendations/recommendations.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SearchModule } from './modules/search/search.module';
import { SeoModule } from './modules/seo/seo.module';
import { SourcesModule } from './modules/sources/sources.module';
import { StoriesModule } from './modules/stories/stories.module';
import { UserDataModule } from './modules/user-data/user-data.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Repo root .env (monorepo single source of truth). In Docker the env
      // vars are injected via `docker-compose.prod.yml`, so a missing file is
      // fine — dotenv silently skips when the file isn't present.
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
    AppSettingsModule,
    EngagementModule,
    GenresModule,
    HealthModule,
    RankingsModule,
    CommentsModule,
    RecommendationsModule,
    ReportsModule,
    SeoModule,
  ],
})
export class AppModule {}
