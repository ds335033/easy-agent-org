import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const credentials = JSON.parse(await readFile('.runtime/local-credentials.json', 'utf8'));
await mkdir('.runtime/screenshots', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(process.env.TEST_APP_URL || 'http://127.0.0.1:3000');
  await page.fill('#access-token', credentials.adminToken);
  await page.click('#login-form button[type=submit]');
  await page.locator('#app').waitFor({ state: 'visible' });
  const evidence = JSON.parse(await readFile('.runtime/live-validation.json', 'utf8'));
  await page.selectOption('#project-select', evidence.projectId);
  await page.waitForFunction(() => document.querySelector('#task-history').options.length > 1);
  await page.selectOption('#task-history', evidence.taskId);
  await page.waitForFunction(() => document.querySelector('#task-feed').textContent.includes('Task complete'));
  await page.locator('.file-button[data-path="index.html"]').click();
  await page.locator('#editor').waitFor({ state: 'visible' });
  assert.ok((await page.locator('#editor').inputValue()).includes('Easy Agent Live'));
  await page.click('[data-view="changes"]');
  await page.waitForFunction(() => !document.querySelector('#diff-output').textContent.includes('Loading'));
  await page.click('[data-view="preview"]');
  await page.click('#preview-form button');
  await page.locator('#preview-frame').waitFor({ state: 'visible' });
  await page.click('[data-view="code"]');
  for (const [name, width, height] of [['desktop', 1440, 1000], ['tablet', 768, 1024], ['phone', 390, 844]]) {
    await page.setViewportSize({ width, height });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name} horizontal overflow`);
    assert.ok(await page.locator('#checkpoint').isVisible());
    await page.screenshot({ path: `.runtime/screenshots/${name}.png`, fullPage: true });
  }
  await page.keyboard.press('Tab');
  assert.ok(await page.evaluate(() => document.activeElement !== document.body));
  assert.deepEqual(errors, []);
  console.log('Browser checks passed: authenticated project, persisted task history, file editor, diff, preview, keyboard focus, 390/768/1440px layouts');
} finally { await browser.close(); }
