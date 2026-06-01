import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateCommentDto {
  @IsIn(['story', 'chapter'])
  targetType!: 'story' | 'chapter';

  @IsUUID()
  targetId!: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;
}
