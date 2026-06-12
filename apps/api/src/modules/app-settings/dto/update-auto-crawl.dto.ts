import { IsBoolean, IsInt, Max, Min } from 'class-validator';

export class UpdateAutoCrawlDto {
  @IsBoolean()
  enabled!: boolean;

  @IsInt()
  @Min(50)
  @Max(2000)
  watermark!: number;
}
