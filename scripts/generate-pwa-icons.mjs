import { chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const icons = [
  { source: 'public/icon-192.svg', output: 'public/icon-192.png', size: 192 },
  { source: 'public/icon-512.svg', output: 'public/icon-512.png', size: 512 },
  { source: 'public/maskable-512.svg', output: 'public/maskable-512.png', size: 512 },
];

const browser = await chromium.launch();
try {
  for (const icon of icons) {
    const page = await browser.newPage({ viewport: { width: icon.size, height: icon.size } });
    await page.goto(pathToFileURL(resolve(icon.source)).href);
    await page.screenshot({ path: resolve(icon.output), omitBackground: true });
    await page.close();
  }
} finally {
  await browser.close();
}
