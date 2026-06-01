import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Database } from '@smanga/db';
import { DRIZZLE } from '@/modules/db/db.provider';

const rowsOf = <T>(r: unknown): T[] =>
  Array.isArray(r) ? (r as T[]) : ((r as { rows?: T[] }).rows ?? []);

export interface NotificationItem {
  id: string;
  type: 'comment_reply' | 'comment_mention';
  actor: { id: string; name: string; image: string | null } | null;
  sourceComment: {
    id: string;
    targetType: 'story' | 'chapter';
    targetId: string;
    body: string | null;
    parentId: string | null;
    storySlug: string | null;
    chapterIndex: string | null;
  } | null;
  readAt: string | null;
  createdAt: string;
}

@Injectable()
export class NotificationsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async listNotifications(
    userId: string,
    unreadOnly: boolean,
    limit: number,
  ): Promise<{ items: NotificationItem[]; unreadCount: number }> {
    const unreadCountRaw = await this.db.execute<{ cnt: string }>(sql`
      SELECT count(*)::int AS cnt FROM notification
      WHERE user_id = ${userId} AND read_at IS NULL
    `);
    const unreadCount = Number(rowsOf<{ cnt: string }>(unreadCountRaw).at(0)?.cnt ?? 0);

    const filter = unreadOnly ? sql`AND n.read_at IS NULL` : sql``;

    const rows = rowsOf<{
      id: string;
      type: string;
      read_at: string | null;
      created_at: string;
      actor_id: string | null;
      actor_name: string | null;
      actor_image: string | null;
      sc_id: string | null;
      sc_target_type: string | null;
      sc_target_id: string | null;
      sc_body: string | null;
      sc_parent_id: string | null;
      sc_deleted_at: string | null;
      story_slug: string | null;
      chapter_index: string | null;
    }>(
      await this.db.execute(sql`
        SELECT
          n.id,
          n.type,
          n.read_at,
          n.created_at,
          au.id         AS actor_id,
          au.name       AS actor_name,
          au.image      AS actor_image,
          sc.id::text   AS sc_id,
          sc.target_type::text AS sc_target_type,
          sc.target_id::text   AS sc_target_id,
          sc.body       AS sc_body,
          sc.parent_id::text   AS sc_parent_id,
          sc.deleted_at AS sc_deleted_at,
          CASE
            WHEN sc.target_type = 'story'
              THEN (SELECT slug FROM story WHERE id = sc.target_id LIMIT 1)
            WHEN sc.target_type = 'chapter'
              THEN (SELECT s.slug FROM chapter ch JOIN story s ON s.id = ch.story_id WHERE ch.id = sc.target_id LIMIT 1)
          END AS story_slug,
          CASE
            WHEN sc.target_type = 'chapter'
              THEN (SELECT ch.index::text FROM chapter ch WHERE ch.id = sc.target_id LIMIT 1)
          END AS chapter_index
        FROM notification n
        LEFT JOIN "user" au ON au.id = n.actor_user_id
        LEFT JOIN "comment" sc ON sc.id = n.source_comment_id
        WHERE n.user_id = ${userId}
        ${filter}
        ORDER BY n.created_at DESC
        LIMIT ${limit}
      `),
    );

    const items: NotificationItem[] = rows.map((r) => ({
      id: r.id,
      type: r.type as 'comment_reply' | 'comment_mention',
      actor: r.actor_id
        ? { id: r.actor_id, name: r.actor_name ?? '', image: r.actor_image }
        : null,
      sourceComment: r.sc_id
        ? {
            id: r.sc_id,
            targetType: r.sc_target_type as 'story' | 'chapter',
            targetId: r.sc_target_id ?? '',
            body: r.sc_deleted_at ? null : r.sc_body,
            parentId: r.sc_parent_id,
            storySlug: r.story_slug,
            chapterIndex: r.chapter_index,
          }
        : null,
      readAt: r.read_at,
      createdAt: r.created_at,
    }));

    return { items, unreadCount };
  }

  async markRead(userId: string, ids: string[] | undefined): Promise<void> {
    if (!ids || ids.length === 0) {
      // Mark all unread
      await this.db.execute(sql`
        UPDATE notification SET read_at = now()
        WHERE user_id = ${userId} AND read_at IS NULL
      `);
    } else {
      // Mark subset — always AND user_id check for security
      // ids is a JS string[]; use sql.join with ::uuid casts (same pattern as comment tree query)
      const uuidList = sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `);
      await this.db.execute(sql`
        UPDATE notification SET read_at = now()
        WHERE id = ANY(ARRAY[${uuidList}])
          AND user_id = ${userId}
          AND read_at IS NULL
      `);
    }
  }
}
