import { IsBoolean } from 'class-validator';

export class UpdateGamificationDto {
  @IsBoolean()
  enabled!: boolean;
}
