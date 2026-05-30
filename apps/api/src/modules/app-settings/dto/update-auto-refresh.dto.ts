import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateAutoRefreshDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  cron?: string;

  @IsOptional()
  @IsIn(['ongoing', 'all'])
  scope?: 'ongoing' | 'all';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  concurrency?: number;
}
