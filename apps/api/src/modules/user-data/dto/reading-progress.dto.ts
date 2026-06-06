import { Type } from 'class-transformer';
import { IsNumber, IsUUID, Min } from 'class-validator';

export class ReadingProgressDto {
  @IsUUID()
  storyId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  chapterIndex!: number;
}
