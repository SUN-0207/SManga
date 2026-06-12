import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsIn, IsUUID } from 'class-validator';

export type BulkAction = 'discover' | 'crawl-missing' | 'crawl-failed' | 'discover-and-crawl';

export class BulkActionDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  ids!: string[];

  @IsIn(['discover', 'crawl-missing', 'crawl-failed', 'discover-and-crawl'])
  action!: BulkAction;
}
