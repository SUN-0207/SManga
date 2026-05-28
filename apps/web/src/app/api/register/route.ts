import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { user } from '@smanga/db/schema';
import { eq } from 'drizzle-orm';
import { getDb } from '@/server/db';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid input', issues: parsed.error.issues }, { status: 400 });
  }
  const db = getDb();
  const [existing] = await db.select().from(user).where(eq(user.email, parsed.data.email)).limit(1);
  if (existing) {
    return NextResponse.json({ error: 'email already registered' }, { status: 409 });
  }
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const [created] = await db
    .insert(user)
    .values({
      id: randomUUID(),
      email: parsed.data.email,
      name: parsed.data.name ?? null,
      passwordHash,
    })
    .returning();
  return NextResponse.json({ id: created!.id, email: created!.email });
}
