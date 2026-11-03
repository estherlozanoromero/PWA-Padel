import { expect, test } from '@playwright/test';

test('muestra el historial activo y restaura un backup validado', async ({ page }) => {
  await page.goto('/players');
  await page.getByLabel('Nombre').fill('Ana Backup');
  await page.getByRole('button', { name: 'Añadir jugador' }).click();
  await expect(page.getByText('Ana Backup', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Abrir ajustes' }).click();
  const exportDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar backup' }).click();
  const exported = await exportDownloadPromise;
  const exportedPath = await exported.path();
  if (!exportedPath) throw new Error('Playwright no ha proporcionado la ruta del backup.');

  await page.locator('input[type="file"]').setInputFiles(exportedPath);
  await expect(page.getByText('Vista previa válida')).toBeVisible();
  await expect(page.getByText(/1 jugadores · 0 parejas · 0 partidos/)).toBeVisible();

  const safetyDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Confirmar y reemplazar todos los datos' }).click();
  await safetyDownloadPromise;
  await expect(page.getByText(/Datos restaurados/)).toBeVisible();

  await page.getByRole('link', { name: 'Jugadores' }).click();
  await expect(page.getByText('Ana Backup', { exact: true })).toBeVisible();
});

test('ofrece historial filtrable y estadísticas sin contar partidos activos', async ({ page }) => {
  await page.goto('/matches');
  await expect(page.getByRole('heading', { name: 'Partidos' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Activos' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Jugador')).toBeVisible();
  await expect(page.getByLabel('Fecha')).toBeVisible();

  await page.getByRole('link', { name: 'Estadísticas' }).click();
  await expect(page.getByRole('heading', { name: 'Estadísticas' })).toBeVisible();
  await expect(page.getByText('Termina un partido para generar estadísticas.')).toBeVisible();
});
