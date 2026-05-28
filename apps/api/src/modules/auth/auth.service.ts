import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { user } from '@smanga/db/schema';
import type { Database } from '@smanga/db';
import { DRIZZLE } from '@/modules/db/db.provider';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';

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
    return { id: created!.id, email: created!.email };
  }

  async login(dto: LoginDto): Promise<{ token: string; user: { id: string; email: string; role: string } }> {
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
      .select({ id: user.id, email: user.email, name: user.name, role: user.role })
      .from(user)
      .where(eq(user.id, id))
      .limit(1);
    return row ?? null;
  }
}
