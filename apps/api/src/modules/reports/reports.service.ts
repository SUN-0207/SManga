import { DRIZZLE } from '@/modules/db/db.provider';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Database } from '@smanga/db';
import { chapter, report, story, user } from '@smanga/db/schema';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { CreateReportDto } from './dto/create-report.dto';
import type { ListReportsDto } from './dto/list-reports.dto';
import type { UpdateReportDto } from './dto/update-report.dto';

const TERMINAL = new Set(['resolved', 'dismissed']);

export type AdminReportItem = {
  id: string;
  category: string;
  message: string;
  status: string;
  adminNote: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  reporterName: string | null;
  reporterEmail: string | null;
  storySlug: string | null;
  storyTitle: string | null;
  chapterIndex: number | null;
};

@Injectable()
export class ReportsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async create(userId: string, dto: CreateReportDto): Promise<{ id: string }> {
    const [row] = await this.db
      .insert(report)
      .values({
        userId,
        category: dto.category,
        message: dto.message,
        storyId: dto.storyId ?? null,
        chapterId: dto.chapterId ?? null,
      })
      .returning({ id: report.id });
    // biome-ignore lint/style/noNonNullAssertion: insert always returns a row
    return { id: row!.id };
  }

  async getOpenCount(): Promise<{ openCount: number }> {
    const [r] = await this.db
      .select({ c: sql<number>`count(*)::int` })
      .from(report)
      .where(eq(report.status, 'open'));
    return { openCount: r?.c ?? 0 };
  }

  async listForAdmin(dto: ListReportsDto & { page: number; limit: number }) {
    const conds = [];
    if (dto.status) conds.push(eq(report.status, dto.status));
    if (dto.category) conds.push(eq(report.category, dto.category));
    const where = conds.length ? and(...conds) : undefined;

    const [countRows, items] = await Promise.all([
      this.db.select({ total: sql<number>`count(*)::int` }).from(report).where(where),
      this.db
        .select({
          id: report.id,
          category: report.category,
          message: report.message,
          status: report.status,
          adminNote: report.adminNote,
          createdAt: report.createdAt,
          resolvedAt: report.resolvedAt,
          reporterName: user.name,
          reporterEmail: user.email,
          storySlug: story.slug,
          storyTitle: story.title,
          chapterIndex: sql<number | null>`(${chapter.index})::float8`,
        })
        .from(report)
        .leftJoin(user, eq(user.id, report.userId))
        .leftJoin(story, eq(story.id, report.storyId))
        .leftJoin(chapter, eq(chapter.id, report.chapterId))
        .where(where)
        .orderBy(desc(report.createdAt))
        .limit(dto.limit)
        .offset((dto.page - 1) * dto.limit),
    ]);
    const total = countRows[0]?.total ?? 0;

    return { items, total, page: dto.page, limit: dto.limit };
  }

  async updateStatus(id: string, dto: UpdateReportDto, adminUserId: string) {
    const patch: Partial<typeof report.$inferInsert> = { updatedAt: new Date() };
    if (dto.adminNote !== undefined) patch.adminNote = dto.adminNote;
    if (dto.status !== undefined) {
      patch.status = dto.status;
      if (TERMINAL.has(dto.status)) {
        patch.resolvedByUserId = adminUserId;
        patch.resolvedAt = new Date();
      } else {
        patch.resolvedByUserId = null;
        patch.resolvedAt = null;
      }
    }
    const [updated] = await this.db.update(report).set(patch).where(eq(report.id, id)).returning();
    if (!updated) throw new NotFoundException(`Report ${id} not found`);
    return updated;
  }
}
