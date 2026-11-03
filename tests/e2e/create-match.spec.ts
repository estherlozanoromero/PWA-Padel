import { expect, test } from '@playwright/test';

test('crea cuatro jugadores y deja un partido listo para jugar', async ({ page }) => {
  await page.goto('/players');

  for (const name of ['Ana', 'Marta', 'Bea', 'Clara']) {
    await page.getByLabel('Nombre').fill(name);
    await page.getByRole('button', { name: 'Añadir jugador' }).click();
    await expect(page.getByText('Jugador creado.')).toBeVisible();
  }

  await page.goto('/matches/new');
  await page.getByLabel('Jugador 1 de pareja A').selectOption({ label: 'Ana' });
  await page.getByLabel('Jugador 2 de pareja A').selectOption({ label: 'Marta' });
  await page.getByRole('button', { name: 'Continuar' }).click();

  await page.getByLabel('Jugador 1 de pareja B').selectOption({ label: 'Bea' });
  await page.getByLabel('Jugador 2 de pareja B').selectOption({ label: 'Clara' });
  await page.getByRole('button', { name: 'Continuar' }).click();

  await page.getByLabel(/Star Point 2026/).check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Iniciar partido' }).click();

  await expect(page.getByRole('heading', { name: 'Partido listo' })).toBeVisible();
  await expect(page.getByText('Ana · Marta')).toBeVisible();
  await expect(page.getByText('Bea · Clara')).toBeVisible();
  await expect(page.getByText('Saca Ana')).toBeVisible();
});
