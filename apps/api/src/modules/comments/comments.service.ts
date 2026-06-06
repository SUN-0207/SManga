import { DRIZZLE } from '@/modules/db/db.provider';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Database } from '@smanga/db';
import { sql } from 'drizzle-orm';

const rowsOf = <T>(r: unknown): T[] =>
  Array.isArray(r) ? (r as T[]) : ((r as { rows?: T[] }).rows ?? []);

export interface CommentTree {
  id: string;
  userId: string;
  user: { id: string; name: string; image: string | null };
  targetType: 'story' | 'chapter';
  targetId: string;
  parentId: string | null;
  depth: 1 | 2 | 3;
  body: string | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  likeCount: number;
  likedByMe: boolean;
  replies: CommentTree[];
}

type FlatRow = {
  id: string;
  user_id: string;
  user_name: string;
  user_image: string | null;
  target_type: 'story' | 'chapter';
  target_id: string;
  parent_id: string | null;
  depth: number;
  body: string;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
  like_count: string;
  liked_by_me: boolean;
};

function sanitize(body: string): string {
  return body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function flatToTree(rows: FlatRow[]): CommentTree[] {
  const map = new Map<string, CommentTree>();
  const roots: CommentTree[] = [];

  for (const r of rows) {
    const node: CommentTree = {
      id: r.id,
      userId: r.user_id,
      user: { id: r.user_id, name: r.user_name, image: r.user_image },
      targetType: r.target_type,
      targetId: r.target_id,
      parentId: r.parent_id,
      depth: Math.min(r.depth, 3) as 1 | 2 | 3,
      body: r.deleted_at ? null : r.body,
      editedAt: r.edited_at,
      deletedAt: r.deleted_at,
      createdAt: r.created_at,
      likeCount: Number(r.like_count),
      likedByMe: Boolean(r.liked_by_me),
      replies: [],
    };
    map.set(r.id, node);
  }

  for (const r of rows) {
    const node = map.get(r.id);
    if (!node) continue;
    if (r.parent_id && map.has(r.parent_id)) {
      map.get(r.parent_id)?.replies.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function rowToTree(node: FlatRow): CommentTree {
  return {
    id: node.id,
    userId: node.user_id,
    user: { id: node.user_id, name: node.user_name, image: node.user_image },
    targetType: node.target_type,
    targetId: node.target_id,
    parentId: node.parent_id,
    depth: Math.min(node.depth, 3) as 1 | 2 | 3,
    body: node.deleted_at ? null : node.body,
    editedAt: node.edited_at,
    deletedAt: node.deleted_at,
    createdAt: node.created_at,
    likeCount: Number(node.like_count),
    likedByMe: Boolean(node.liked_by_me),
    replies: [],
  };
}

@Injectable()
export class CommentsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  // -------------------------------------------------------------------------
  // LIST (paginated root comments + full reply tree)
  // -------------------------------------------------------------------------

  async listComments(
    targetType: string,
    targetId: string,
    page: number,
    limit: number,
    userId: string | null,
  ): Promise<{ items: CommentTree[]; total: number; page: number; limit: number }> {
    const offset = (page - 1) * limit;

    // Count root comments only (parent_id IS NULL)
    const countRaw = await this.db.execute<{ cnt: string }>(sql`
      SELECT count(*)::int AS cnt
      FROM "comment"
      WHERE target_type = ${targetType}::comment_target_type
        AND target_id = ${targetId}::uuid
        AND parent_id IS NULL
    `);
    const total = Number(rowsOf<{ cnt: string }>(countRaw).at(0)?.cnt ?? 0);

    // Fetch root IDs for this page
    const rootsRaw = await this.db.execute<{ id: string }>(sql`
      SELECT id FROM "comment"
      WHERE target_type = ${targetType}::comment_target_type
        AND target_id = ${targetId}::uuid
        AND parent_id IS NULL
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);
    const rootIds = rowsOf<{ id: string }>(rootsRaw).map((r) => r.id);

    if (rootIds.length === 0) {
      return { items: [], total, page, limit };
    }

    // Fetch flat list: roots + all their descendants + user join + like aggregate
    // IMPORTANT: rootIds is a JS string[]. Drizzle's sql tag does NOT auto-serialize
    // a JS array as a Postgres array literal. We use sql.join with explicit uuid casts
    // to build a valid ARRAY[...] expression. DO NOT pass rootIds directly to ANY().
    const rootUuidList = sql.join(
      rootIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    );
    const flatRaw = await this.db.execute<FlatRow>(sql`
      WITH RECURSIVE tree AS (
        SELECT id FROM "comment"
        WHERE id = ANY(ARRAY[${rootUuidList}])
        UNION ALL
        SELECT c.id FROM "comment" c
        JOIN tree t ON c.parent_id = t.id
      )
      SELECT
        c.id,
        c.user_id,
        u.name AS user_name,
        u.image AS user_image,
        c.target_type::text,
        c.target_id::text,
        c.parent_id::text,
        c.depth,
        c.body,
        c.edited_at,
        c.deleted_at,
        c.created_at,
        COALESCE(r.like_count, 0) AS like_count,
        CASE WHEN lr.comment_id IS NOT NULL THEN true ELSE false END AS liked_by_me
      FROM "comment" c
      JOIN tree ON tree.id = c.id
      JOIN "user" u ON u.id = c.user_id
      LEFT JOIN (
        SELECT comment_id, count(*)::int AS like_count
        FROM comment_reaction
        GROUP BY comment_id
      ) r ON r.comment_id = c.id
      LEFT JOIN comment_reaction lr
        ON lr.comment_id = c.id
        AND lr.user_id = ${userId ?? ''}
        AND lr.type = 'like'
      ORDER BY c.parent_id NULLS FIRST, c.created_at DESC
    `);

    const flat = rowsOf<FlatRow>(flatRaw);
    const items = flatToTree(flat);
    return { items, total, page, limit };
  }

  // -------------------------------------------------------------------------
  // CREATE
  // -------------------------------------------------------------------------

  async createComment(
    userId: string,
    targetType: string,
    targetId: string,
    parentId: string | null,
    body: string,
  ): Promise<CommentTree> {
    const trimmed = body.trim();
    if (trimmed.length === 0 || body.length > 2000) {
      throw new BadRequestException('body must be 1-2000 characters');
    }
    const sanitized = sanitize(body);

    // Validate target existence
    if (targetType === 'story') {
      const rows = rowsOf<{ id: string }>(
        await this.db.execute<{ id: string }>(
          sql`SELECT id FROM story WHERE id = ${targetId}::uuid LIMIT 1`,
        ),
      );
      if (rows.length === 0) throw new NotFoundException('Story not found');
    } else if (targetType === 'chapter') {
      const rows = rowsOf<{ id: string }>(
        await this.db.execute<{ id: string }>(
          sql`SELECT id FROM chapter WHERE id = ${targetId}::uuid LIMIT 1`,
        ),
      );
      if (rows.length === 0) throw new NotFoundException('Chapter not found');
    } else {
      throw new BadRequestException('targetType must be story or chapter');
    }

    let depth = 1;
    let resolvedParentId: string | null = null;

    if (parentId) {
      const parentRows = rowsOf<{
        id: string;
        depth: number;
        user_id: string;
        target_type: string;
        target_id: string;
      }>(
        await this.db.execute(sql`
          SELECT id, depth, user_id, target_type::text, target_id::text
          FROM "comment"
          WHERE id = ${parentId}::uuid AND deleted_at IS NULL
          LIMIT 1
        `),
      );
      if (parentRows.length === 0) throw new NotFoundException('Parent comment not found');
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const parent = parentRows[0]!;
      if (parent.target_type !== targetType || parent.target_id !== targetId) {
        throw new BadRequestException('Parent comment does not belong to this target');
      }
      depth = Math.min(parent.depth + 1, 3);
      resolvedParentId = parentId;
    }

    const inserted = rowsOf<{ id: string }>(
      await this.db.execute<{ id: string }>(sql`
        INSERT INTO "comment" (user_id, target_type, target_id, parent_id, depth, body)
        VALUES (
          ${userId},
          ${targetType}::comment_target_type,
          ${targetId}::uuid,
          ${resolvedParentId ? sql`${resolvedParentId}::uuid` : sql`NULL`},
          ${depth},
          ${sanitized}
        )
        RETURNING id
      `),
    );
    const newId = inserted.at(0)?.id;
    if (!newId) throw new BadRequestException('Failed to insert comment');

    // Dispatch notifications (best-effort, not in transaction)
    await this._dispatchNotifications(newId, userId, resolvedParentId, sanitized);

    return this._fetchSingleTree(newId, userId);
  }

  private async _dispatchNotifications(
    commentId: string,
    actorId: string,
    parentId: string | null,
    body: string,
  ): Promise<void> {
    try {
      // Reply notification
      if (parentId) {
        const parentOwnerRows = rowsOf<{ user_id: string }>(
          await this.db.execute(
            sql`SELECT user_id FROM "comment" WHERE id = ${parentId}::uuid LIMIT 1`,
          ),
        );
        const parentOwnerId = parentOwnerRows.at(0)?.user_id;
        if (parentOwnerId && parentOwnerId !== actorId) {
          await this.db.execute(sql`
            INSERT INTO notification (user_id, type, source_comment_id, actor_user_id)
            VALUES (${parentOwnerId}, 'comment_reply', ${commentId}::uuid, ${actorId})
          `);
        }
      }

      // Mention notifications — @(\w+) regex
      const mentions = [...body.matchAll(/@(\w+)/g)]
        .map((m) => m[1])
        .filter((n): n is string => n !== undefined);
      const seen = new Set<string>();
      for (const name of mentions) {
        if (seen.has(name)) continue;
        seen.add(name);
        const userRows = rowsOf<{ id: string }>(
          await this.db.execute(sql`
            SELECT id FROM "user"
            WHERE lower(name) = lower(${name})
            LIMIT 1
          `),
        );
        const mentionedId = userRows.at(0)?.id;
        if (mentionedId && mentionedId !== actorId) {
          await this.db.execute(sql`
            INSERT INTO notification (user_id, type, source_comment_id, actor_user_id)
            VALUES (${mentionedId}, 'comment_mention', ${commentId}::uuid, ${actorId})
          `);
        }
      }
    } catch {
      // Notification failure must not break comment creation
    }
  }

  private async _fetchSingleTree(id: string, userId: string | null): Promise<CommentTree> {
    const rows = rowsOf<FlatRow>(
      await this.db.execute<FlatRow>(sql`
        SELECT
          c.id,
          c.user_id,
          u.name AS user_name,
          u.image AS user_image,
          c.target_type::text,
          c.target_id::text,
          c.parent_id::text,
          c.depth,
          c.body,
          c.edited_at,
          c.deleted_at,
          c.created_at,
          COALESCE(r.like_count, 0) AS like_count,
          CASE WHEN lr.comment_id IS NOT NULL THEN true ELSE false END AS liked_by_me
        FROM "comment" c
        JOIN "user" u ON u.id = c.user_id
        LEFT JOIN (
          SELECT comment_id, count(*)::int AS like_count
          FROM comment_reaction GROUP BY comment_id
        ) r ON r.comment_id = c.id
        LEFT JOIN comment_reaction lr
          ON lr.comment_id = c.id AND lr.user_id = ${userId ?? ''} AND lr.type = 'like'
        WHERE c.id = ${id}::uuid
        LIMIT 1
      `),
    );
    const node = rows.at(0);
    if (!node) throw new NotFoundException('Comment not found');
    return rowToTree(node);
  }

  // -------------------------------------------------------------------------
  // UPDATE (5-min edit window)
  // -------------------------------------------------------------------------

  async updateComment(id: string, userId: string, body: string): Promise<CommentTree> {
    if (body.trim().length === 0 || body.length > 2000) {
      throw new BadRequestException('body must be 1-2000 characters');
    }
    const sanitized = sanitize(body);

    const rows = rowsOf<{ user_id: string; created_at: string; deleted_at: string | null }>(
      await this.db.execute(sql`
        SELECT user_id, created_at, deleted_at FROM "comment"
        WHERE id = ${id}::uuid LIMIT 1
      `),
    );
    const c = rows.at(0);
    if (!c) throw new NotFoundException('Comment not found');
    if (c.deleted_at) throw new ForbiddenException('Comment is deleted');
    if (c.user_id !== userId) throw new ForbiddenException('Not your comment');

    const withinWindow = rowsOf<{ ok: boolean }>(
      await this.db.execute(sql`
        SELECT (created_at > now() - interval '5 minutes') AS ok
        FROM "comment" WHERE id = ${id}::uuid
      `),
    );
    if (!withinWindow.at(0)?.ok)
      throw new ForbiddenException('Edit window of 5 minutes has passed');

    await this.db.execute(sql`
      UPDATE "comment"
      SET body = ${sanitized}, edited_at = now(), updated_at = now()
      WHERE id = ${id}::uuid
    `);

    return this._fetchSingleTree(id, userId);
  }

  // -------------------------------------------------------------------------
  // DELETE (soft)
  // -------------------------------------------------------------------------

  async deleteComment(id: string, userId: string, role: string): Promise<void> {
    const rows = rowsOf<{ user_id: string; deleted_at: string | null }>(
      await this.db.execute(sql`
        SELECT user_id, deleted_at FROM "comment" WHERE id = ${id}::uuid LIMIT 1
      `),
    );
    const c = rows.at(0);
    if (!c) throw new NotFoundException('Comment not found');
    if (c.user_id !== userId && role !== 'admin') {
      throw new ForbiddenException('Not allowed to delete this comment');
    }
    await this.db.execute(sql`
      UPDATE "comment" SET deleted_at = now(), updated_at = now()
      WHERE id = ${id}::uuid
    `);
  }

  // -------------------------------------------------------------------------
  // REACT (toggle like)
  // -------------------------------------------------------------------------

  async toggleReact(
    commentId: string,
    userId: string,
  ): Promise<{ likeCount: number; likedByMe: boolean }> {
    const exists = rowsOf<{ comment_id: string }>(
      await this.db.execute(sql`
        SELECT comment_id FROM comment_reaction
        WHERE comment_id = ${commentId}::uuid AND user_id = ${userId} AND type = 'like'
        LIMIT 1
      `),
    );

    if (exists.length > 0) {
      await this.db.execute(sql`
        DELETE FROM comment_reaction
        WHERE comment_id = ${commentId}::uuid AND user_id = ${userId} AND type = 'like'
      `);
    } else {
      await this.db.execute(sql`
        INSERT INTO comment_reaction (comment_id, user_id, type)
        VALUES (${commentId}::uuid, ${userId}, 'like')
        ON CONFLICT DO NOTHING
      `);
    }

    const countRow = rowsOf<{ cnt: string }>(
      await this.db.execute(sql`
        SELECT count(*)::int AS cnt FROM comment_reaction
        WHERE comment_id = ${commentId}::uuid AND type = 'like'
      `),
    );
    return {
      likeCount: Number(countRow.at(0)?.cnt ?? 0),
      likedByMe: exists.length === 0, // just inserted = now liked
    };
  }
}
