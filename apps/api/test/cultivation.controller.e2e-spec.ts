import 'reflect-metadata';
import { type INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { JwtAuthGuard } from '../src/common/guards/jwt.guard';
import { CultivationController } from '../src/modules/cultivation/cultivation.controller';
import { CultivationService } from '../src/modules/cultivation/cultivation.service';

describe('CultivationController (e2e, global pipe)', () => {
  let app: INestApplication;
  const service = {
    getState: vi.fn(),
    checkin: vi.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CultivationController],
      providers: [{ provide: CultivationService, useValue: service }],
    })
      // Bypass auth — exercising the validation pipe and routing, not guards.
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: import('@nestjs/common').ExecutionContext) => {
          ctx.switchToHttp().getRequest().user = { id: 'test-user-id', role: 'user' };
          return true;
        },
      })
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

  it('GET /api/v1/me/cultivation returns state', async () => {
    service.getState.mockResolvedValue({
      realmName: 'Luyện Khí',
      tang: 1,
      ordinal: 1,
      xp: 14000,
      linhThach: 500,
      tienNgoc: 20,
      checkinStreak: 1,
    });
    await request(app.getHttpServer()).get('/api/v1/me/cultivation').expect(200);
  });

  it('POST /api/v1/me/checkin returns credit result', async () => {
    service.checkin.mockResolvedValue({ credited: true, streakDay: 1, amount: 1000, newStreak: 1 });
    await request(app.getHttpServer()).post('/api/v1/me/checkin').expect(200);
    expect(service.checkin).toHaveBeenCalled();
  });
});
