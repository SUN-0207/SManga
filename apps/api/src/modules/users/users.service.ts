import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { count, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { account, bookmark, readingProgress, user } from '@smanga/db/schema';
import type { Database } from '@smanga/db';
import { DRIZZLE } from '@/modules/db/db.provider';

const MAX_PAGE_SIZE = 100;

@Injectable()
export class UsersService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async list(opts: { page: number; limit: number; q?: string }) {
    const limit = Math.min(Math.max(opts.limit, 1), MAX_PAGE_SIZE);
    const page = Math.max(opts.page, 1);
    const term = opts.q?.trim();

    const where = term
      ? or(ilike(user.email, `%${term}%`), ilike(user.name, `%${term}%`))
      : undefined;

    const countQuery = this.db.select({ total: count() }).from(user);
    const countRows = where ? await countQuery.where(where) : await countQuery;
    const total = countRows[0]?.total ?? 0;

    const listQuery = this.db
      .select({
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        role: user.role,
        createdAt: user.createdAt,
        hasPassword: sql<boolean>`${user.passwordHash} IS NOT NULL`,
      })
      .from(user)
      .orderBy(desc(user.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);
    const rows = where ? await listQuery.where(where) : await listQuery;

    return {
      items: rows,
      total: Number(total),
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(Number(total) / limit)),
    };
  }

  async getById(id: string) {
    const [row] = await this.db
      .select({
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        role: user.role,
        createdAt: user.createdAt,
        hasPassword: sql<boolean>`${user.passwordHash} IS NOT NULL`,
      })
      .from(user)
      .where(eq(user.id, id))
      .limit(1);
    if (!row) throw new NotFoundException('User not found');

    const accounts = await this.db
      .select({ provider: account.provider })
      .from(account)
      .where(eq(account.userId, id));

    const bookmarkRows = await this.db
      .select({ bookmarks: count() })
      .from(bookmark)
      .where(eq(bookmark.userId, id));
    const bookmarks = bookmarkRows[0]?.bookmarks ?? 0;

    const readingRows = await this.db
      .select({ reading: count() })
      .from(readingProgress)
      .where(eq(readingProgress.userId, id));
    const reading = readingRows[0]?.reading ?? 0;

    return {
      ...row,
      providers: accounts.map((a) => a.provider),
      bookmarkCount: Number(bookmarks),
      readingCount: Number(reading),
    };
  }

  async updateRole(actorId: string, targetId: string, role: 'user' | 'admin') {
    if (actorId === targetId) {
      throw new ForbiddenException('Không thể tự đổi role của chính mình.');
    }
    if (role !== 'user' && role !== 'admin') {
      throw new BadRequestException('Invalid role');
    }
    const [updated] = await this.db
      .update(user)
      .set({ role })
      .where(eq(user.id, targetId))
      .returning({ id: user.id, role: user.role });
    if (!updated) throw new NotFoundException('User not found');
    return updated;
  }

  async remove(actorId: string, targetId: string) {
    if (actorId === targetId) {
      throw new ForbiddenException('Không thể xoá chính mình.');
    }
    const result = await this.db
      .delete(user)
      .where(eq(user.id, targetId))
      .returning({ id: user.id });
    if (result.length === 0) throw new NotFoundException('User not found');
    return { ok: true };
  }
}
