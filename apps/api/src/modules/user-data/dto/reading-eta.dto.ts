import { IsUUID } from 'class-validator';

export class ReadingEtaDto {
  @IsUUID()
  storyId!: string;
}
