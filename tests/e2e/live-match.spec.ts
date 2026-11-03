import { expect, test, type Page } from '@playwright/test';

async function createLiveMatch(page: Page) {
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
  await page.getByLabel(/^Star Point 2026/).check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Iniciar partido' }).click();
  await expect(page.getByRole('heading', { name: 'Marcador en directo' })).toBeVisible();
}

test('guarda, recupera, pausa y deshace el marcador en directo', async ({ page }) => {
  await createLiveMatch(page);
  const pointA = page.getByRole('button', { name: 'Punto para pareja A' });

  await pointA.click();
  await expect(pointA.getByText('15')).toBeVisible();
  await page.reload();
  await expect(pointA.getByText('15')).toBeVisible();
  await page.getByRole('link', { name: 'Volver al inicio' }).click();
  await expect(page.getByRole('heading', { name: 'Continuar partido' })).toBeVisible();
  await page.getByRole('link', { name: /Ana.*contra Bea/ }).click();
  await expect(pointA.getByText('15')).toBeVisible();

  await page.getByRole('button', { name: 'Pausar' }).click();
  await expect(page.getByRole('dialog', { name: 'Partido pausado' })).toBeVisible();
  await page.getByRole('button', { name: 'Reanudar partido' }).click();
  await expect(page.getByRole('dialog', { name: 'Partido pausado' })).toBeHidden();

  await page.getByRole('button', { name: /Deshacer/ }).click();
  await expect(pointA.getByText('0')).toBeVisible();
});

test('resuelve Star Point con elección de lado y receptor', async ({ page }) => {
  await createLiveMatch(page);
  const pointA = page.getByRole('button', { name: 'Punto para pareja A' });
  const pointB = page.getByRole('button', { name: 'Punto para pareja B' });

  for (const winner of ['A', 'A', 'A', 'B', 'B', 'B', 'A', 'B', 'B', 'A']) {
    await (winner === 'A' ? pointA : pointB).click();
  }

  await expect(page.getByRole('dialog', { name: 'Star Point' })).toBeVisible();
  await page.getByText('Izquierda').click();
  await page.getByLabel('Receptor').selectOption({ label: 'Bea' });
  await page.getByRole('button', { name: 'Confirmar receptor' }).click();
  await pointA.click();

  await expect(page.getByRole('dialog', { name: 'Cambio de lado' })).toBeVisible();
  await page.getByRole('button', { name: 'Cambio realizado' }).click();
  await expect(page.getByText('SET 1 · JUEGO 2')).toBeVisible();
});
