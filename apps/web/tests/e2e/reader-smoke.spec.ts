import { expect, test } from '@playwright/test';

// Prereq: postgres up, web dev server running on :3000, at least one story
// imported with crawled chapters (Plan 1 smoke leaves "xuyen-thu-chi-ba-ai-doc-the"
// in the DB by default).

test('landing shows at least one story', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Mới cập nhật' })).toBeVisible();
  await expect(page.locator('a[href^="/truyen/"]').first()).toBeVisible();
});

test('story detail page renders title and chapter list', async ({ page }) => {
  await page.goto('/');
  const firstStoryLink = page.locator('a[href^="/truyen/"]').first();
  await firstStoryLink.click();
  await expect(page).toHaveURL(/\/truyen\/[^/]+/);
  await expect(page.getByRole('heading', { name: 'Danh sách chương' })).toBeVisible();
});

test('reader settings toggle persists font size in localStorage', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Cài đặt' }).click();
  await page.getByRole('button', { name: '22', exact: true }).click();
  const stored = await page.evaluate(() => window.localStorage.getItem('smanga:reader:font-size'));
  expect(stored).toBe('22');
});

test('robots.txt is served', async ({ request }) => {
  const res = await request.get('/robots.txt');
  expect(res.ok()).toBe(true);
  const body = await res.text();
  expect(body).toContain('Disallow: /admin/');
});
