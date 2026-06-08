/**
 * Jobs controller e2e suite — refetch-all-chapters endpoint.
 *
 * Strategy: build a focused NestJS test application that wires only the
 * JobsController + real JwtAuthGuard / RolesGuard with a fixed test JWT
 * secret. This avoids pulling in Bull/Redis (QueueModule), Postgres (DbModule),
 * or any other infrastructure module.
 *
 * Guard execution order mirrors the real AuthModule:
 *   APP_GUARD #1: OptionalJwtGuard  — populates req.user from Bearer token,
 *                                     never rejects unauthenticated requests
 *   APP_GUARD #2: RolesGuard        — enforces @Roles() metadata
 *   controller @UseGuards:          JwtAuthGuard — rejects missing/invalid token
 *
 * NOTE: Because APP_GUARDs fire before controller-level @UseGuards, the
 * RolesGuard (APP_GUARD #2) sees req.user = null for unauthenticated requests
 * and throws ForbiddenException (403) before JwtAuthGuard (controller-level)
 * can fire with its 401. This is the real app's observable behaviour — all
 * admin-gated endpoints return 403 for both anonymous and non-admin callers.
 *
 * The JobsService is replaced by a stub so the test never touches a queue.
 *
 * Tests:
 *  - Unauthenticated → 403 (RolesGuard fires before JwtAuthGuard, no user → forbidden)
 *  - Reader role     → 403 (RolesGuard rejects non-admin)
 *  - Admin role      → 202 (guard passes, service stub runs)
 */
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Global, Injectable, Module, VersioningType } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PassportStrategy } from '@nestjs/passport';
import { Test, type TestingModule } from '@nestjs/testing';
import { ExtractJwt, Strategy } from 'passport-jwt';
import supertest from 'supertest';
import { JwtAuthGuard, OptionalJwtGuard } from '../src/common/guards/jwt.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { JobsController } from '../src/modules/jobs/jobs.controller';
import { JobsService } from '../src/modules/jobs/jobs.service';

// ── test constants ─────────────────────────────────────────────────────────────
const TEST_JWT_SECRET = 'test-secret-for-e2e';

// ── stub service ───────────────────────────────────────────────────────────────
@Injectable()
class StubJobsService {
  refetchAllChapters() {
    return Promise.resolve({ enqueued: 0 });
  }
}

// ── inline JWT strategy with known secret ──────────────────────────────────────
// Registered as 'jwt' strategy so JwtAuthGuard / OptionalJwtGuard both resolve it.
@Injectable()
class TestJwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: TEST_JWT_SECRET,
    });
  }

  async validate(payload: { sub: string; email: string; role: string }) {
    return { id: payload.sub, email: payload.email, role: payload.role };
  }
}

// ── focused test module ────────────────────────────────────────────────────────
// Guard order matters: OptionalJwtGuard populates req.user first, then
// RolesGuard checks @Roles() metadata. JwtAuthGuard on the controller class
// fires last (after APP_GUARDs) and rejects truly unauthenticated callers.
@Global()
@Module({
  imports: [
    PassportModule,
    JwtModule.register({ secret: TEST_JWT_SECRET, signOptions: { expiresIn: '1h' } }),
  ],
  controllers: [JobsController],
  providers: [
    { provide: JobsService, useClass: StubJobsService },
    TestJwtStrategy,
    JwtAuthGuard,
    OptionalJwtGuard,
    // APP_GUARD #1 — populate req.user without rejecting anonymous requests
    { provide: APP_GUARD, useClass: OptionalJwtGuard },
    // APP_GUARD #2 — enforce @Roles() metadata
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
class TestJobsModule {}

// ─────────────────────────────────────────────────────────────────────────────

describe('Jobs refetch-all-chapters (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  beforeAll(async () => {
    const m: TestingModule = await Test.createTestingModule({
      imports: [TestJobsModule],
    }).compile();
    app = m.createNestApplication();
    app.setGlobalPrefix('api', {
      exclude: ['sitemap.xml', 'sitemap-stories.xml', 'sitemap-chapters.xml', 'robots.txt'],
    });
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();

    jwtService = m.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects unauthenticated callers with 403', () => {
    // APP_GUARD RolesGuard fires before the controller-level JwtAuthGuard;
    // it sees req.user = null and throws ForbiddenException (403).
    return supertest(app.getHttpServer()).post('/api/v1/jobs/refetch-all-chapters').expect(403);
  });

  it('rejects reader role with 403', () => {
    const token = jwtService.sign({ sub: 'user-1', email: 'reader@test.com', role: 'reader' });
    return supertest(app.getHttpServer())
      .post('/api/v1/jobs/refetch-all-chapters')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('accepts admin role with 202', () => {
    const token = jwtService.sign({ sub: 'admin-1', email: 'admin@test.com', role: 'admin' });
    return supertest(app.getHttpServer())
      .post('/api/v1/jobs/refetch-all-chapters')
      .set('Authorization', `Bearer ${token}`)
      .expect(202);
  });
});
