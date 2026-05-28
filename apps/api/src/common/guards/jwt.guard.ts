import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

/**
 * Optional JWT guard — populates req.user from cookie/header if a valid token is
 * present, but does NOT reject requests that have no token at all.
 * Registered as APP_GUARD so it runs before RolesGuard.
 */
@Injectable()
export class OptionalJwtGuard extends AuthGuard('jwt') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  override handleRequest(_err: any, user: any) {
    // Never throw — simply return the user (or undefined/null for unauthenticated)
    return user ?? null;
  }
}
