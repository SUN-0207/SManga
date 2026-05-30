import { Module, type Provider } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { APP_GUARD } from '@nestjs/core';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { GoogleStrategy, isGoogleEnabled } from './google.strategy';
import { JwtStrategy } from './jwt.strategy';
import { OptionalJwtGuard } from '@/common/guards/jwt.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { loadEnv } from '@/config/env';

const oauthProviders: Provider[] = isGoogleEnabled() ? [GoogleStrategy] : [];

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: loadEnv().JWT_SECRET,
      signOptions: { expiresIn: '14d' },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    ...oauthProviders,
    // OptionalJwtGuard runs first — populates req.user from cookie/header when a
    // valid JWT is present, but does NOT reject unauthenticated requests.
    { provide: APP_GUARD, useClass: OptionalJwtGuard },
    // RolesGuard runs second — enforces @Roles() metadata when present.
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
