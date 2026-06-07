import { createHash } from 'node:crypto';
import { Controller, Get, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { SeoService } from './seo.service';

const CACHE_24H = 'public, max-age=86400, stale-while-revalidate=3600';

function setSeoHeaders(res: Response, body: string, contentType: string): void {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', CACHE_24H);
  res.setHeader('ETag', `"${createHash('sha1').update(body).digest('hex')}"`);
}

@ApiTags('seo')
@Controller()
export class SeoController {
  constructor(private readonly seo: SeoService) {}

  @Get('sitemap.xml')
  async sitemapIndex(@Res() res: Response): Promise<void> {
    const body = this.seo.buildSitemapIndexXml(new Date().toISOString());
    setSeoHeaders(res, body, 'application/xml; charset=utf-8');
    res.send(body);
  }

  @Get('sitemap-stories.xml')
  async sitemapStories(@Res() res: Response): Promise<void> {
    const stories = await this.seo.listStoriesForSitemap();
    const body = this.seo.buildSitemapStoriesXml(stories);
    setSeoHeaders(res, body, 'application/xml; charset=utf-8');
    res.send(body);
  }

  @Get('sitemap-chapters.xml')
  async sitemapChapters(@Res() res: Response): Promise<void> {
    const chapters = await this.seo.listChaptersForSitemap();
    const body = this.seo.buildSitemapChaptersXml(chapters);
    setSeoHeaders(res, body, 'application/xml; charset=utf-8');
    res.send(body);
  }

  @Get('robots.txt')
  robots(@Res() res: Response): void {
    const body = this.seo.buildRobotsTxt();
    setSeoHeaders(res, body, 'text/plain; charset=utf-8');
    res.send(body);
  }
}
