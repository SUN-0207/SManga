import { IsEnum, IsOptional, IsString, IsUUID, Length } from 'class-validator';

export const REPORT_CATEGORIES = ['content', 'comment', 'technical', 'other'] as const;

export class CreateReportDto {
  @IsEnum(REPORT_CATEGORIES)
  category!: (typeof REPORT_CATEGORIES)[number];

  @IsString()
  @Length(5, 2000)
  message!: string;

  @IsOptional()
  @IsUUID()
  storyId?: string;

  @IsOptional()
  @IsUUID()
  chapterId?: string;
}
