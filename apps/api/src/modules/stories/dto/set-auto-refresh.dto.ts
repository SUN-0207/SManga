import { IsBoolean } from 'class-validator';

export class SetAutoRefreshDto {
  @IsBoolean()
  autoRefresh!: boolean;
}
