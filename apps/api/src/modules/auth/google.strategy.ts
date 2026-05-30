import { ExecutionContext, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { AuthGuard, PassportStrategy } from '@nestjs/passport';
import { Strategy, type Profile, type StrategyOptions } from 'passport-google-oauth20';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { loadEnv } from '@/config/env';

export const GOOGLE_STRATEGY_NAME = 'google';

export function isGoogleEnabled(): boolean {
  const env = loadEnv();
  return Boolean(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET);
}

function callbackUrl(): string {
  const env = loadEnv();
  if (env.AUTH_GOOGLE_CALLBACK_URL) return env.AUTH_GOOGLE_CALLBACK_URL;
  return `http://localhost:${env.PORT}/api/v1/auth/google/callback`;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, GOOGLE_STRATEGY_NAME) {
  private static readonly logger = new Logger(GoogleStrategy.name);

  constructor(private readonly auth: AuthService) {
    const env = loadEnv();
    const opts: StrategyOptions = {
      clientID: env.AUTH_GOOGLE_ID ?? 'disabled',
      clientSecret: env.AUTH_GOOGLE_SECRET ?? 'disabled',
      callbackURL: callbackUrl(),
      scope: ['email', 'profile'],
    };
    super(opts);
    if (!isGoogleEnabled()) {
      GoogleStrategy.logger.warn(
        'Google OAuth strategy registered but env not configured — /auth/google will 503.',
      );
    }
  }

  async validate(_accessToken: string, _refreshToken: string, profile: Profile) {
    const email = profile.emails?.[0]?.value;
    const emailVerified = profile.emails?.[0]?.verified ?? false;
    if (!email || !emailVerified) {
      throw new Error('Google did not return a verified email');
    }
    const user = await this.auth.findOrCreateOAuthUser({
      provider: 'google',
      providerAccountId: profile.id,
      email,
      name: profile.displayName ?? null,
      image: profile.photos?.[0]?.value ?? null,
    });
    return user;
  }
}

/**
 * Custom guard that forwards the `?redirect=` query into Google's `state` param.
 * Google echoes `state` back on the callback, so we read it from `req.query.state`
 * to know where to send the user after a successful login.
 */
@Injectable()
export class GoogleAuthGuard extends AuthGuard(GOOGLE_STRATEGY_NAME) {
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!isGoogleEnabled()) {
      throw new ServiceUnavailableException('Google OAuth not configured');
    }
    return (await super.canActivate(context)) as boolean;
  }

  override getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    const redirect = typeof req.query.redirect === 'string' ? req.query.redirect : '/tu-sach';
    return { state: redirect };
  }
}
