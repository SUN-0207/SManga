import { IsEnum, IsOptional, IsString, Length } from 'class-validator';

export const REPORT_STATUSES = ['open', 'in_progress', 'resolved', 'dismissed'] as const;

export class UpdateReportDto {
  @IsOptional()
  @IsEnum(REPORT_STATUSES)
  status?: (typeof REPORT_STATUSES)[number];

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  adminNote?: string;
}
