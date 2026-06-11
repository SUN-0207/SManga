import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Throttler keyed by the REAL client IP. Prod is behind cloudflared -> caddy,
 * and main.ts sets no `trust proxy`, so req.ip is the tunnel IP (shared by
 * every visitor). Cloudflare always sets CF-Connecting-IP at the origin, so we
 * key on that and fall back to req.ip for local dev. Used route-scoped (e.g.
 * on /auth/login) — never as a global guard, which would share one bucket.
 */
@Injectable()
export class RealIpThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: {
    headers?: Record<string, unknown>;
    ip?: string;
  }): Promise<string> {
    const cf = req.headers?.['cf-connecting-ip'];
    const ip = (typeof cf === 'string' && cf) || req.ip || 'unknown';
    return Promise.resolve(ip);
  }
}
