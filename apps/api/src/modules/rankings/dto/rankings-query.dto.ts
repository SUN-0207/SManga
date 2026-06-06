import { Type } from 'class-transformer';
// apps/api/src/modules/rankings/dto/rankings-query.dto.ts
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class RankingsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 50;
}
