import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { REPORT_CATEGORIES } from './create-report.dto';
import { REPORT_STATUSES } from './update-report.dto';

export class ListReportsDto {
  @IsOptional()
  @IsEnum(REPORT_STATUSES)
  status?: (typeof REPORT_STATUSES)[number];

  @IsOptional()
  @IsEnum(REPORT_CATEGORIES)
  category?: (typeof REPORT_CATEGORIES)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
