import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class SearchQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  q!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  genre?: string;

  @IsOptional()
  @IsIn(['ongoing', 'completed', 'dropped', 'unknown'])
  status?: 'ongoing' | 'completed' | 'dropped' | 'unknown';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 24;
}
