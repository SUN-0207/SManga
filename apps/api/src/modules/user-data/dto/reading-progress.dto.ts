import { IsNumber, IsUUID, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ReadingProgressDto {
  @IsUUID()
  storyId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  chapterIndex!: number;
}
