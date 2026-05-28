import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue, JobStatus } from 'bull';
import { QUEUE_CRAWLER } from '@/modules/queue/queue.constants';

@Injectable()
export class JobsService {
  constructor(@InjectQueue(QUEUE_CRAWLER) private readonly queue: Queue) {}

  async stats() {
    const counts = await this.queue.getJobCounts(); // { waiting, active, completed, failed, delayed, paused }
    return counts;
  }

  async list(limit = 100) {
    const states: JobStatus[] = ['waiting', 'active', 'completed', 'failed', 'delayed'];
    const jobs = await this.queue.getJobs(states, 0, limit - 1, false);
    return jobs.map((j) => ({
      id: String(j.id),
      name: j.name,
      state: j.failedReason ? 'failed' : j.finishedOn ? 'completed' : j.processedOn ? 'active' : 'waiting',
      attemptsMade: j.attemptsMade,
      timestamp: j.timestamp,
      processedOn: j.processedOn,
      finishedOn: j.finishedOn,
      failedReason: j.failedReason ?? null,
      data: j.data,
    }));
  }

  async retry(id: string) {
    const job = await this.queue.getJob(id);
    if (!job) return { ok: false };
    if (await job.isFailed()) {
      await job.retry();
      return { ok: true };
    }
    return { ok: false, reason: 'not failed' };
  }
}
