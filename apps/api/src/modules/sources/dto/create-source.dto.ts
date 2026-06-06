import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString, IsUrl, Min } from 'class-validator';

export class CreateSourceDto {
  @IsString()
  id!: string;

  @IsString()
  name!: string;

  @IsUrl()
  baseUrl!: string;

  @IsNumber()
  @Type(() => Number)
  @Min(0.1)
  @IsOptional()
  rateLimitRps?: number;
}

export class UpdateSourceDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsUrl()
  baseUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  rateLimitRps?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// NEW — Plan crawl-all
export class DiscoverAllSourceDto {
  @IsString()
  feed!: string;

  @IsBoolean()
  @IsOptional()
  autoCrawl?: boolean;
}
