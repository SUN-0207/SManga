import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsOptional, IsUrl } from 'class-validator';

export class ImportStoryDto {
  @IsUrl()
  url!: string;
}

/**
 * Plan 7 bulk metadata-only import from the catalog action bar. Cap
 * enforced server-side in StoriesService for an authoritative limit, but
 * we also reject >50 here so client-side validation matches.
 */
export class ImportStoryBulkDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUrl({}, { each: true })
  urls!: string[];

  /** Auto-chain: after metadata import, fire discover-chapters → fetch-chapter. */
  @IsOptional()
  @IsBoolean()
  autoCrawl?: boolean;
}
