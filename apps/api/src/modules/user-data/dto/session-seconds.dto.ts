import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsUUID, Max, Min } from 'class-validator';

export class SessionSecondsDto {
  @IsUUID()
  storyId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  chapterIndex!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(600)
  seconds!: number;
}
