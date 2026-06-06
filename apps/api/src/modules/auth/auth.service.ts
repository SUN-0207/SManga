import { randomUUID } from 'node:crypto';
import { DRIZZLE } from '@/modules/db/db.provider';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import type { Database } from '@smanga/db';
import { account, user } from '@smanga/db/schema';
import * as bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { and } from 'drizzle-orm';
import type { ChangePasswordDto } from './dto/change-password.dto';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';
import type { UpdateMeDto } from './dto/update-me.dto';

export interface JwtPayload {
  sub: string;
  email: string;
  role: 'user' | 'admin';
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const [existing] = await this.db.select().from(user).where(eq(user.email, dto.email)).limit(1);
    if (existing) throw new ConflictException('Email already registered');
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const [created] = await this.db
      .insert(user)
      .values({
        id: randomUUID(),
        email: dto.email,
        name: dto.name ?? null,
        passwordHash,
      })
      .returning();
    return { id: created?.id, email: created?.email };
  }

  async login(
    dto: LoginDto,
  ): Promise<{ token: string; user: { id: string; email: string; role: string } }> {
    const [row] = await this.db.select().from(user).where(eq(user.email, dto.email)).limit(1);
    if (!row || !row.passwordHash) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(dto.password, row.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    const payload: JwtPayload = { sub: row.id, email: row.email, role: row.role };
    const token = this.jwt.sign(payload);
    return { token, user: { id: row.id, email: row.email, role: row.role } };
  }

  async getById(id: string) {
    const [row] = await this.db
      .select({
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        role: user.role,
      })
      .from(user)
      .where(eq(user.id, id))
      .limit(1);
    return row ?? null;
  }

  async updateMe(id: string, dto: UpdateMeDto) {
    if (dto.name === undefined && dto.image === undefined) {
      throw new BadRequestException('Nothing to update');
    }
    const patch: Partial<typeof user.$inferInsert> = {};
    if (dto.name !== undefined) patch.name = dto.name.trim();
    if (dto.image !== undefined) patch.image = dto.image;

    const [updated] = await this.db.update(user).set(patch).where(eq(user.id, id)).returning({
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      role: user.role,
    });
    if (!updated) throw new NotFoundException('User not found');
    return updated;
  }

  /**
   * Look up (or create) a user from an OAuth provider profile.
   *
   * Linking rule: if the email matches an existing user, link the OAuth account
   * to that user (no duplicate). Otherwise create a fresh user with no password.
   * Google returns the verified email — caller already validated `email_verified`.
   */
  async findOrCreateOAuthUser(params: {
    provider: 'google';
    providerAccountId: string;
    email: string;
    name: string | null;
    image: string | null;
  }) {
    // 1. existing account row for this (provider, providerAccountId)?
    const [linked] = await this.db
      .select({ userId: account.userId })
      .from(account)
      .where(
        and(
          eq(account.provider, params.provider),
          eq(account.providerAccountId, params.providerAccountId),
        ),
      )
      .limit(1);
    if (linked) {
      return this.getById(linked.userId);
    }

    // 2. user with same email?
    const [existing] = await this.db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, params.email))
      .limit(1);

    let userId: string;
    if (existing) {
      userId = existing.id;
    } else {
      const created = await this.db
        .insert(user)
        .values({
          id: randomUUID(),
          email: params.email,
          name: params.name,
          image: params.image,
        })
        .returning({ id: user.id });
      userId = created[0]?.id;
    }

    // 3. link the OAuth account
    await this.db.insert(account).values({
      userId,
      type: 'oauth',
      provider: params.provider,
      providerAccountId: params.providerAccountId,
    });

    return this.getById(userId);
  }

  /** Sign a JWT for an already-authenticated user (e.g. OAuth callback). */
  signTokenFor(row: { id: string; email: string; role: 'user' | 'admin' }): string {
    return this.jwt.sign({ sub: row.id, email: row.email, role: row.role });
  }

  async changePassword(id: string, dto: ChangePasswordDto) {
    const [row] = await this.db
      .select({ passwordHash: user.passwordHash })
      .from(user)
      .where(eq(user.id, id))
      .limit(1);
    if (!row || !row.passwordHash) throw new UnauthorizedException('No password set');
    const ok = await bcrypt.compare(dto.currentPassword, row.passwordHash);
    if (!ok) throw new UnauthorizedException('Current password incorrect');
    const newHash = await bcrypt.hash(dto.newPassword, 10);
    await this.db.update(user).set({ passwordHash: newHash }).where(eq(user.id, id));
  }
}
