import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt.guard';
import { loadEnv } from '@/config/env';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import type { ChangePasswordDto } from './dto/change-password.dto';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';
import type { UpdateMeDto } from './dto/update-me.dto';
import { GOOGLE_STRATEGY_NAME, GoogleAuthGuard, isGoogleEnabled } from './google.strategy';

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @HttpCode(201)
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { token, user } = await this.auth.login(dto);
    res.cookie('jwt', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24 * 14,
    });
    return { user };
  }

  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('jwt');
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: { id: string }) {
    return this.auth.getById(user.id);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  async updateMe(@CurrentUser() user: { id: string }, @Body() dto: UpdateMeDto) {
    return this.auth.updateMe(user.id, dto);
  }

  @Post('change-password')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async changePassword(@CurrentUser() user: { id: string }, @Body() dto: ChangePasswordDto) {
    await this.auth.changePassword(user.id, dto);
  }

  // ---- OAuth ---------------------------------------------------------------

  /** Public — FE checks which provider buttons to show. */
  @Get('providers')
  providers() {
    return { google: isGoogleEnabled() };
  }

  /** Start Google OAuth flow. GoogleAuthGuard forwards ?redirect= into state. */
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  google() {
    if (!isGoogleEnabled()) {
      throw new ServiceUnavailableException('Google OAuth not configured');
    }
  }

  /** Google callback — passport populates req.user via GoogleStrategy.validate. */
  @Get('google/callback')
  @UseGuards(AuthGuard(GOOGLE_STRATEGY_NAME))
  googleCallback(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Query('state') state?: string,
  ) {
    const user = req.user as { id: string; email: string; role: 'user' | 'admin' } | undefined;
    if (!user) throw new ServiceUnavailableException('OAuth handshake failed');
    const token = this.auth.signTokenFor(user);
    res.cookie('jwt', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24 * 14,
    });
    // State carries the post-login redirect path (validated to be a same-origin path).
    const fallback = '/tu-sach';
    const safeRedirect = state?.startsWith('/') ? state : fallback;
    const frontendBase = loadEnv().FRONTEND_BASE_URL.replace(/\/+$/, '');
    res.redirect(`${frontendBase}${safeRedirect}`);
  }
}
