import { request } from 'undici';

const baseUrl = process.env.WEB_BASE_URL ?? 'http://localhost:3000';
const secret = process.env.REVALIDATE_SECRET ?? '';

export async function revalidatePaths(paths: string[]): Promise<void> {
  if (!secret) return; // silently skip in dev if not configured
  try {
    await request(`${baseUrl}/api/revalidate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-revalidate-secret': secret },
      body: JSON.stringify({ paths }),
    });
  } catch {
    // best-effort; do not fail the job
  }
}
