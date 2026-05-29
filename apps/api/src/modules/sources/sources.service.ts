import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { browseCatalog, getAdapter, listAdapters, searchCatalog } from '@smanga/crawler';
import { source } from '@smanga/db/schema';
import type { Database } from '@smanga/db';
import { DRIZZLE } from '@/modules/db/db.provider';
import type { CreateSourceDto, UpdateSourceDto } from './dto/create-source.dto';

@Injectable()
export class SourcesService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  list() {
    return this.db.select().from(source).orderBy(asc(source.id));
  }

  async create(dto: CreateSourceDto) {
    const valid = new Set(listAdapters().map((a) => a.id));
    if (!valid.has(dto.id)) {
      throw new BadRequestException(`No adapter registered for id=${dto.id}. Valid: ${[...valid].join(', ')}`);
    }
    const [existing] = await this.db.select().from(source).where(eq(source.id, dto.id)).limit(1);
    if (existing) throw new ConflictException(`source ${dto.id} already exists`);
    await this.db.insert(source).values({
      id: dto.id,
      name: dto.name,
      baseUrl: dto.baseUrl,
      rateLimitRps: String(dto.rateLimitRps ?? 1),
    });
    return { ok: true };
  }

  async update(id: string, dto: UpdateSourceDto) {
    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (dto.name) update.name = dto.name;
    if (dto.baseUrl) update.baseUrl = dto.baseUrl;
    if (dto.rateLimitRps) update.rateLimitRps = String(dto.rateLimitRps);
    if (dto.isActive !== undefined) update.isActive = dto.isActive;
    const result = await this.db.update(source).set(update).where(eq(source.id, id)).returning();
    if (result.length === 0) throw new NotFoundException();
    return { ok: true };
  }

  async remove(id: string) {
    try {
      const result = await this.db.delete(source).where(eq(source.id, id)).returning();
      if (result.length === 0) throw new NotFoundException();
      return { ok: true };
    } catch (err) {
      throw new ConflictException(`cannot delete: ${(err as Error).message}`);
    }
  }

  /**
   * Plan 7 catalog browse — return adapter's declared catalog feeds + whether
   * search is supported. Used by the discover UI to render feed tabs.
   */
  feeds(sourceId: string) {
    let adapter;
    try {
      adapter = getAdapter(sourceId);
    } catch {
      throw new NotFoundException(`no adapter for source ${sourceId}`);
    }
    return {
      sourceId: adapter.id,
      sourceName: adapter.name,
      baseUrl: adapter.baseUrl,
      feeds: adapter.catalogFeeds,
      supportsSearch: Boolean(adapter.buildSearchUrl && adapter.parseSearchPage),
    };
  }

  async discover(sourceId: string, feedId: string | undefined, page: number, query: string | undefined) {
    try {
      getAdapter(sourceId);
    } catch {
      throw new NotFoundException(`no adapter for source ${sourceId}`);
    }
    if (query && query.trim().length > 0) {
      return searchCatalog(this.db, sourceId, query.trim(), page);
    }
    if (!feedId) {
      throw new BadRequestException('either feed or q is required');
    }
    return browseCatalog(this.db, sourceId, feedId, page);
  }
}
