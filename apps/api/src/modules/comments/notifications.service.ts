import { DRIZZLE } from '@/modules/db/db.provider';
import { Inject, Injectable } from '@nestjs/common';
import type { Database } from '@smanga/db';
import { REALMS } from '@smanga/shared';
import { sql } from 'drizzle-orm';

const rowsOf = <T>(r: unknown): T[] =>
  Array.isArray(r) ? (r as T[]) : ((r as { rows?: T[] }).rows ?? []);

export interface NotificationItem {
  id: string;
  type: 'comment_reply' | 'comment_mention' | 'new_chapter' | 'breakthrough';
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
  newChapter: {
    storySlug: string;
    storyTitle: string;
    newCount: number;
    targetChapterIndex: string;
  } | null;
  breakthrough: { realmName: string } | null;
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
      nc_slug: string | null;
      nc_title: string | null;
      nc_new_count: number | null;
      nc_target_index: string | null;
      bt_realm: number | null;
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
          ,st.slug  AS nc_slug
          ,st.title AS nc_title
          ,n.new_count AS nc_new_count
          ,CASE WHEN n.type = 'new_chapter' THEN
             greatest(
               least(floor(coalesce(rp.chapter_index, 0))::int + 1, floor(n.chapter_index)::int),
               1
             )::text
           END AS nc_target_index
          ,CASE WHEN n.type = 'breakthrough' THEN n.chapter_index::int END AS bt_realm
        FROM notification n
        LEFT JOIN "user" au ON au.id = n.actor_user_id
        LEFT JOIN "comment" sc ON sc.id = n.source_comment_id
        LEFT JOIN story st ON st.id = n.story_id
        LEFT JOIN reading_progress rp ON rp.user_id = n.user_id AND rp.story_id = n.story_id
        WHERE n.user_id = ${userId}
        ${filter}
        ORDER BY n.created_at DESC
        LIMIT ${limit}
      `),
    );

    const items: NotificationItem[] = rows.map((r) => ({
      id: r.id,
      type: r.type as NotificationItem['type'],
      actor: r.actor_id ? { id: r.actor_id, name: r.actor_name ?? '', image: r.actor_image } : null,
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
      newChapter:
        r.type === 'new_chapter' && r.nc_slug
          ? {
              storySlug: r.nc_slug,
              storyTitle: r.nc_title ?? '',
              newCount: Number(r.nc_new_count ?? 1),
              targetChapterIndex: r.nc_target_index ?? '1',
            }
          : null,
      breakthrough:
        r.type === 'breakthrough' && r.bt_realm != null
          ? { realmName: REALMS[r.bt_realm] ?? 'Luyện Khí' }
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
      const uuidList = sql.join(
        ids.map((id) => sql`${id}::uuid`),
        sql`, `,
      );
      await this.db.execute(sql`
        UPDATE notification SET read_at = now()
        WHERE id = ANY(ARRAY[${uuidList}])
          AND user_id = ${userId}
          AND read_at IS NULL
      `);
    }
  }
}
