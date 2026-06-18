import { IsEnum, IsOptional } from 'class-validator';
import { REPORT_CATEGORIES } from './create-report.dto';
import { REPORT_STATUSES } from './update-report.dto';

export class ListReportsDto {
  @IsOptional()
  @IsEnum(REPORT_STATUSES)
  status?: (typeof REPORT_STATUSES)[number];

  @IsOptional()
  @IsEnum(REPORT_CATEGORIES)
  category?: (typeof REPORT_CATEGORIES)[number];

  // page/limit parsed/clamped in the controller (mirror the stories admin list).
}
