import { expect, test } from '@playwright/test';

// Prereq: postgres up, web dev server running on :3000, admin@test.com user promoted to admin.

test('admin can sign in and reach dashboard', async ({ page }) => {
  await page.goto('/dang-nhap');
  await page.getByLabel('Email').fill('admin@test.com');
  await page.getByLabel('Mật khẩu').fill('adminpassword');
  await page.getByRole('button', { name: /đăng nhập/i }).click();
  await expect(page).toHaveURL(/\/admin/);
  await expect(page.getByRole('heading', { name: 'Tổng quan' })).toBeVisible();
});

test('admin sources page lists truyenfull', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/dang-nhap');
  await page.getByLabel('Email').fill('admin@test.com');
  await page.getByLabel('Mật khẩu').fill('adminpassword');
  await page.getByRole('button', { name: /đăng nhập/i }).click();
  // Wait until the session is established and middleware allows admin access.
  await page.waitForURL(/\/admin/, { timeout: 30_000 });
  await page.goto('/admin/sources');
  await expect(page.getByText('truyenfull', { exact: true })).toBeVisible();
});

test('unauthenticated user redirected from /admin', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: undefined });
  const page = await ctx.newPage();
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/dang-nhap/);
});
