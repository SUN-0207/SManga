import { IsBoolean, IsInt, IsNumber, Max, Min } from 'class-validator';

export class UpdateAutoCrawlDto {
  @IsBoolean()
  enabled!: boolean;

  @IsInt()
  @Min(50)
  @Max(2000)
  watermark!: number;

  @IsNumber()
  @Min(0.1)
  @Max(20)
  crawlRps!: number;
}
