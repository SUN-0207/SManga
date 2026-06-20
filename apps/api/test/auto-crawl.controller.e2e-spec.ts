import 'reflect-metadata';
import { type INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { JwtAuthGuard } from '../src/common/guards/jwt.guard';
import { AppSettingsService } from '../src/modules/app-settings/app-settings.service';
import { AutoCrawlController } from '../src/modules/app-settings/auto-crawl.controller';

describe('AutoCrawlController (e2e, global pipe)', () => {
  let app: INestApplication;
  const service = {
    getAutoCrawl: vi.fn().mockResolvedValue({
      autoCrawlEnabled: true,
      autoCrawlWatermark: 500,
      crawlRps: 4,
    }),
    setAutoCrawl: vi.fn((enabled: boolean, watermark: number, crawlRps: number) =>
      Promise.resolve({ autoCrawlEnabled: enabled, autoCrawlWatermark: watermark, crawlRps }),
    ),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AutoCrawlController],
      providers: [{ provide: AppSettingsService, useValue: service }],
    })
      // Bypass auth for the test — we are exercising the validation pipe, not the guards.
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    // Mirror main.ts exactly so the test catches what prod would reject.
    app.setGlobalPrefix('api', {
      exclude: ['sitemap.xml', 'sitemap-stories.xml', 'sitemap-chapters.xml', 'robots.txt'],
    });
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('accepts a valid patch with crawlRps', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/admin/settings/auto-crawl')
      .send({ enabled: true, watermark: 800, crawlRps: 6 })
      .expect(200);
    expect(service.setAutoCrawl).toHaveBeenCalledWith(true, 800, 6);
  });

  it('rejects crawlRps above the max (400)', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/admin/settings/auto-crawl')
      .send({ enabled: true, watermark: 800, crawlRps: 50 })
      .expect(400);
  });

  it('rejects an unknown field (400, forbidNonWhitelisted)', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/admin/settings/auto-crawl')
      .send({ enabled: true, watermark: 800, crawlRps: 6, bogus: 1 })
      .expect(400);
  });
});
