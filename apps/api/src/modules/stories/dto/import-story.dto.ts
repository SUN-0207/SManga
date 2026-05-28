import { IsUrl } from 'class-validator';

export class ImportStoryDto {
  @IsUrl()
  url!: string;
}
