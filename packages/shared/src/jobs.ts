import { z } from 'zod';

export const importStoryPayloadSchema = z.object({
  url: z.string().url(),
  requestedBy: z.string().min(1).nullable(),
});
export type ImportStoryPayload = z.infer<typeof importStoryPayloadSchema>;

export const fetchChapterPayloadSchema = z.object({
  chapterId: z.string().uuid(),
});
export type FetchChapterPayload = z.infer<typeof fetchChapterPayloadSchema>;

export const JOB_NAMES = {
  importStory: 'import-story',
  fetchChapter: 'fetch-chapter',
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];
