import { IsInt, Max, Min } from 'class-validator';

export class RateStoryDto {
  @IsInt()
  @Min(1)
  @Max(5)
  value!: number;
}
