import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { Inject } from '@nestjs/common';
import { story } from '@smanga/db/schema';
import type { Database } from '@smanga/db';
import { DRIZZLE } from '@/modules/db/db.provider';

@ApiTags('covers')
@Controller({ path: 'cover', version: '1' })
export class CoversController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Get(':storyId')
  async get(
    @Param('storyId') storyId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const [row] = await this.db
      .select({ cover: story.cover, mime: story.coverMimeType })
      .from(story)
      .where(eq(story.id, storyId))
      .limit(1);
    if (!row?.cover) {
      res.status(404).send('Not found');
      return;
    }
    const etag = `"${createHash('sha1').update(row.cover as Buffer).digest('hex')}"`;
    if (req.headers['if-none-match'] === etag) {
      res.status(304).setHeader('ETag', etag).end();
      return;
    }
    res
      .status(200)
      .setHeader('Content-Type', row.mime ?? 'image/jpeg')
      .setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      .setHeader('ETag', etag)
      .send(row.cover as Buffer);
  }
}
