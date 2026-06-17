import { IsBoolean } from 'class-validator';

export class UpdateNewChapterNotifyDto {
  @IsBoolean()
  enabled!: boolean;
}
