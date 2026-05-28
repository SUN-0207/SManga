import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export class CrawlChaptersDto {
  @IsEnum(['missing', 'all', 'one'])
  mode!: 'missing' | 'all' | 'one';

  @IsOptional()
  @IsUUID()
  chapterId?: string;
}
