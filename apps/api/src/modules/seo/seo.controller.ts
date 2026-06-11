import { Controller, Get, Param, Req, Res, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { SeoService } from './seo.service';

const CACHE_24H = 'public, max-age=86400, stale-while-revalidate=3600';
const XML = 'application/xml; charset=utf-8';

@ApiTags('seo')
// VERSION_NEUTRAL + main.ts setGlobalPrefix exclude keep these at the root
// (/sitemap.xml, not /api/v1/sitemap.xml) as crawlers expect.
@Controller({ version: VERSION_NEUTRAL })
export class SeoController {
  constructor(private readonly seo: SeoService) {}

  @Get('sitemap.xml')
  sitemapIndex(@Req() req: Request, @Res() res: Response): Promise<void> {
    return this.serve(req, res, 'index');
  }

  @Get('sitemap-stories.xml')
  sitemapStories(@Req() req: Request, @Res() res: Response): Promise<void> {
    return this.serve(req, res, 'stories');
  }

  // Sharded chapter sitemaps (the index lists each). chapters-1 doubles as the
  // backcompat target for the old monolithic /sitemap-chapters.xml URL.
  @Get('sitemap-chapters-:n.xml')
  sitemapChapterShard(
    @Param('n') n: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const num = Number(n);
    if (!Number.isInteger(num) || num < 1) {
      res.status(404).send('not found');
      return Promise.resolve();
    }
    return this.serve(req, res, `chapters-${num}`);
  }

  @Get('sitemap-chapters.xml')
  sitemapChaptersLegacy(@Req() req: Request, @Res() res: Response): Promise<void> {
    return this.serve(req, res, 'chapters-1');
  }

  @Get('robots.txt')
  robots(@Res() res: Response): void {
    const body = this.seo.buildRobotsTxt();
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', CACHE_24H);
    res.send(body);
  }

  private async serve(req: Request, res: Response, key: string): Promise<void> {
    const entry = await this.seo.getSitemap(key);
    if (!entry) {
      res.status(404).send('not found');
      return;
    }
    res.setHeader('Content-Type', XML);
    res.setHeader('Cache-Control', CACHE_24H);
    res.setHeader('ETag', entry.etag);
    if (req.headers['if-none-match'] === entry.etag) {
      res.status(304).end();
      return;
    }
    res.send(entry.body);
  }
}
