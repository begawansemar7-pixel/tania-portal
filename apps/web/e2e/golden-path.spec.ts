import { expect, test } from '@playwright/test';

/**
 * The golden path, in a real browser.
 *
 * These assert what only a browser can: that the app boots, that a question
 * typed by a person produces an answer on screen, and that the pages a person
 * navigates to actually render. Behaviour detail belongs in the component
 * tests, which are faster and more precise.
 */

test('a person can ask TANIA a question and get an answer', async ({ page }) => {
  await page.goto('/tania');

  const composer = page.getByLabel('Pesan untuk TANIA');
  await expect(composer).toBeVisible();

  await composer.fill('Cari kebijakan tata kelola AI');
  await composer.press('Enter');

  // The question appears immediately; the answer arrives streamed.
  await expect(page.getByText('Cari kebijakan tata kelola AI').first()).toBeVisible();
  await expect(composer).toBeEnabled({ timeout: 30_000 });

  // The result panel carries the answer, and the field is usable again.
  await expect(page.getByRole('tab', { name: /Hasil/ })).toBeVisible();
  await expect(page.getByText('Mulai percakapan dengan TANIA')).toBeHidden();
});

test('the answer cites what it is based on, or says it has none', async ({ page }) => {
  await page.goto('/tania');

  const composer = page.getByLabel('Pesan untuk TANIA');
  await composer.fill('Bagaimana kinerja delivery kuartal ini?');
  await composer.press('Enter');
  await expect(composer).toBeEnabled({ timeout: 30_000 });

  // Either citations, or an explicit statement that there are none — never
  // an assertion with nothing behind it.
  const panel = page.getByLabel('Panel eksekusi dan hasil');
  await expect(panel.getByText(/Sitasi|Tidak ada dokumen enterprise/)).toBeVisible();
});

test('every primary page renders', async ({ page }) => {
  for (const path of [
    '/',
    '/dashboard',
    '/my-work',
    '/tania',
    '/knowledge',
    '/agents',
    '/documents',
    '/analytics',
    '/command-center',
    '/settings',
  ]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBeLessThan(400);

    // A page that renders its shell but throws inside a section would still
    // return 200, so the heading is what is checked.
    await expect(page.getByRole('heading', { level: 1 }).first(), path).toBeVisible();
  }
});

test('security headers are present on a real navigation', async ({ page }) => {
  const response = await page.goto('/tania');
  const headers = response?.headers() ?? {};

  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['x-content-type-options']).toBe('nosniff');
});

test('the browser reports no console errors on the workspace', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/tania');
  await expect(page.getByLabel('Pesan untuk TANIA')).toBeVisible();
  await page.waitForTimeout(2000);

  expect(errors).toEqual([]);
});
