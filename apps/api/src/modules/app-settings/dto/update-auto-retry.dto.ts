import { IsBoolean } from 'class-validator';

export class UpdateAutoRetryDto {
  @IsBoolean()
  enabled!: boolean;
}
