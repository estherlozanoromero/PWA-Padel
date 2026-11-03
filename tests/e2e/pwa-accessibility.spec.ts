import { expect, test } from '@playwright/test';

test('abre una ruta precargada sin conexión después de la primera visita', async ({
  page,
  context,
}) => {
  await page.goto('/statistics');
  await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) throw new Error('Service worker no disponible');
    await navigator.serviceWorker.ready;
  });
  const manifest = await page.evaluate(async () => {
    const href = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.href;
    if (!href) throw new Error('Manifest no enlazado');
    return (await fetch(href)).text();
  });
  expect(manifest).toContain('icon-192.png');
  expect(manifest).toContain('maskable-512.png');
  await page.reload();
  expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await expect(page.getByRole('heading', { name: 'Estadísticas' })).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Estadísticas' })).toBeVisible();
  await expect(page.getByText('Modo sin conexión')).toBeVisible();
  await context.setOffline(false);
});

test('mantiene el recorrido principal operable a 360 píxeles y con teclado', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflows).toBe(false);

  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Padel Score, inicio' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Abrir ajustes' })).toBeFocused();
  await page.getByRole('link', { name: 'Abrir ajustes' }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Ajustes y datos' })).toBeVisible();
});
