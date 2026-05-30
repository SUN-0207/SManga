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
    if (!job) return { ok: false, reason: 'job not found' };
    try {
      await job.retry();
      return { ok: true };
    } catch {
      // Bull refuses retry() on non-failed jobs (e.g., jobs that exhausted attempts
      // are sometimes moved to 'completed' with failedReason populated). Clone
      // with the same name + data so the user-visible "Retry" always re-enqueues.
      const cloned = await this.queue.add(job.name, job.data, {
        attempts: job.opts.attempts ?? 3,
        backoff: job.opts.backoff,
      });
      try {
        await job.remove();
      } catch {
        /* keep going even if cleanup fails */
      }
      return { ok: true, requeued: true, newId: String(cloned.id) };
    }
  }
}
