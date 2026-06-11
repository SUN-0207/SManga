import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class ListStoriesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 48;

  /** Filter by genre slug (e.g. "xuyen-khong"). */
  @IsOptional()
  @IsString()
  genre?: string;

  /** When true, only return stories with featured = true. */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  featured?: boolean;

  /**
   * Filter by Plan 7 discovery state.
   * - `complete` → stories whose chapter index finished discovering
   * - `stub` → metadata-only stories (`pending` | `running` | `failed`)
   */
  @IsOptional()
  @IsIn(['complete', 'stub'])
  discoveryStatus?: 'complete' | 'stub';

  /**
   * Crawl-completeness filter (orthogonal to discoveryStatus).
   * - `needs-crawl` → discovery complete AND has ≥1 pending|failed chapter
   */
  @IsOptional()
  @IsIn(['needs-crawl'])
  crawlState?: 'needs-crawl';

  /** Filter by exact author name (used by the "Cùng tác giả" rail). */
  @IsOptional()
  @IsString()
  author?: string;

  /**
   * Free-text search over `title || ' ' || author` (Vietnamese-friendly via
   * the existing GIN/pg_trgm index on `immutable_unaccent(lower(...))`).
   */
  @IsOptional()
  @IsString()
  q?: string;
}
