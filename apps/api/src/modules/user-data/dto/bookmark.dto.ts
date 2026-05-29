import { IsUUID } from 'class-validator';

export class BookmarkDto {
  @IsUUID()
  storyId!: string;
}
