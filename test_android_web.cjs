const { chromium } = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');

const html = fs.readFileSync('web/index.html', 'utf8');

async function openPage(browser, android) {
  const context = await browser.newContext({ viewport: { width: 420, height: 900 } });
  if (android) {
    await context.addInitScript(() => {
      window.saved = [];
      window.AndroidHost = {
        saveVideo: (id, name) => window.saved.push({ id, name }),
        saveBatch: folder => window.saved.push({ folder }),
        closeApp: () => window.saved.push({ closed: true }),
      };
    });
  }
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: html });
    if (url.pathname === '/api/projects') return route.fulfill({ json: { projects: [], hasKey: false } });
    if (url.pathname === '/api/export') return route.fulfill({ json: { job: 'test' } });
    if (url.pathname === '/api/job') return route.fulfill({ json: {
      state: 'done', message: '完成', result: { count: 1, folder: '/private/导出素材/20261104_123456_abcdef' },
    } });
    return route.fulfill({ status: 404, json: { error: 'unexpected request' } });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:9999/?token=test');
  await page.evaluate(() => {
    project = { id: '0123456789abcdef', title: 'test', subtitles: [],
      clips: [{ start: 0, end: 1, english: 'Hi.', chinese: '你好。' }],
      outputs: [{ id: '20261104_123456_abcdef', name: '成片_横版.mp4', count: 1, seconds: 2 }] };
    renderClips();
    renderOutputs();
  });
  return { context, page, errors };
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const android = await openPage(browser, true);
    assert.match(await android.page.locator('#platformBadge').innerText(), /Android/);
    assert.equal(await android.page.locator('#openOutput').isVisible(), false);
    await android.page.locator('[data-save-output]').click();
    assert.deepEqual(await android.page.evaluate(() => window.saved[0]), {
      id: '20261104_123456_abcdef', name: '成片_横版.mp4',
    });
    await android.page.locator('#export').click();
    await android.page.waitForFunction(() => window.saved.length === 2);
    assert.match((await android.page.evaluate(() => window.saved[1])).folder, /导出素材/);
    android.page.once('dialog', dialog => dialog.accept());
    await android.page.locator('#quit').click();
    assert.deepEqual(await android.page.evaluate(() => window.saved[2]), { closed: true });
    assert.deepEqual(android.errors, []);
    await android.context.close();

    const desktop = await openPage(browser, false);
    assert.match(await desktop.page.locator('#platformBadge').innerText(), /Windows/);
    assert.equal(await desktop.page.locator('#openOutput').isVisible(), true);
    assert.equal(await desktop.page.locator('[data-save-output]').count(), 0);
    assert.deepEqual(desktop.errors, []);
    await desktop.context.close();
    console.log('Android bridge UI and Windows UI: PASS (mocked browser interfaces)');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
