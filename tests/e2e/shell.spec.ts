import { expect, test } from '@playwright/test';

test('muestra el inicio y permite navegar por el shell móvil', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: /tu partido/i })).toBeVisible();
  await page.getByRole('link', { name: 'Jugadores' }).click();
  await expect(page.getByRole('heading', { name: 'Jugadores y parejas' })).toBeVisible();
});
