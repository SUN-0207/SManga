import process from 'node:process';
import PgBoss from 'pg-boss';
import pino from 'pino';
import { JOB_NAMES } from '@smanga/shared';
import { createDb } from '@smanga/db';
import '@smanga/crawler'; // side effect: registers truyenfull adapter
import { handleImportStory } from './jobs/import-story.js';
import { handleFetchChapter } from './jobs/fetch-chapter.js';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info', base: { service: 'crawler-worker' } });

const url = process.env.DATABASE_URL;
if (!url) {
  logger.fatal('DATABASE_URL is required');
  process.exit(1);
}

const db = createDb(url);
const boss = new PgBoss(url);

boss.on('error', (err) => logger.error({ err }, 'boss error'));

async function main() {
  await boss.start();
  logger.info('worker started');

  await boss.work(JOB_NAMES.importStory, async (jobs) => {
    for (const j of jobs) {
      logger.info({ jobId: j.id }, 'import-story start');
      try {
        await handleImportStory(db, j.data);
        logger.info({ jobId: j.id }, 'import-story done');
      } catch (err) {
        logger.error({ jobId: j.id, err: (err as Error).message }, 'import-story failed');
        throw err;
      }
    }
  });

  await boss.work(JOB_NAMES.fetchChapter, { batchSize: 1 }, async (jobs) => {
    for (const j of jobs) {
      logger.info({ jobId: j.id }, 'fetch-chapter start');
      try {
        await handleFetchChapter(db, j.data);
        logger.info({ jobId: j.id }, 'fetch-chapter done');
      } catch (err) {
        logger.error({ jobId: j.id, err: (err as Error).message }, 'fetch-chapter failed');
        throw err;
      }
    }
  });
}

main().catch((err) => {
  logger.fatal({ err }, 'worker crashed');
  process.exit(1);
});

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'shutting down');
  await boss.stop({ graceful: true, timeout: 10_000 });
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
