import { pgEnum } from 'drizzle-orm/pg-core';

export const storyStatusEnum = pgEnum('story_status', [
  'ongoing',
  'completed',
  'dropped',
  'unknown',
]);

export const storySourceStatusEnum = pgEnum('story_source_status', ['active', 'unavailable']);

export const chapterStatusEnum = pgEnum('chapter_status', ['pending', 'crawled', 'failed']);

export const userRoleEnum = pgEnum('user_role', ['user', 'admin']);

export const storyDiscoveryStatusEnum = pgEnum('story_discovery_status', [
  'pending',
  'running',
  'complete',
  'failed',
]);

export const commentTargetTypeEnum = pgEnum('comment_target_type', ['story', 'chapter']);
