import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const DATA_URL_PATTERN = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/]+=*$/;

export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200_000)
  @Matches(DATA_URL_PATTERN, {
    message: 'image must be a base64 data URL (png/jpeg/webp)',
  })
  image?: string;
}
