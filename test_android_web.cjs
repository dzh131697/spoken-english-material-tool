const { chromium } = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');

const html = fs.readFileSync('web/index.html', 'utf8');
const sample = {
  id: '0123456789abcdef', title: 'Example video',
  subtitles: [
    { start: 0.5, end: 2, text: 'How was your weekend?' },
    { start: 2.2, end: 4.5, text: 'I had a great time.' },
    { start: 4.5, end: 5.5, text: 'What about you?' },
  ],
  clips: [{ start: 0.5, end: 2, english: 'How was your weekend?', chinese: '周末怎么样？' }],
  outputs: [{ id: '20261104_123456_abcdef', name: '成片_横版.mp4', count: 1, seconds: 2 }],
};

async function openPage(browser, android, width = 390) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: android });
  await context.addInitScript(isAndroid => {
    window.saved = [];
    window.played = 0;
    Object.defineProperty(HTMLMediaElement.prototype, 'duration', { get: () => 100, configurable: true });
    HTMLMediaElement.prototype.play = function () { window.played++; return Promise.resolve(); };
    HTMLMediaElement.prototype.pause = function () {};
    if (isAndroid) {
      window.AndroidHost = {
        saveVideo: (id, name) => window.saved.push({ id, name }),
        saveBatch: folder => window.saved.push({ folder }),
        closeApp: () => window.saved.push({ closed: true }),
        checkForUpdates: () => window.saved.push({ checked: true }),
      };
    }
  }, android);
  const state = { saves: [], failNextSave: false, suggestCalls: 0 };
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: html });
    if (url.pathname === '/api/projects') return route.fulfill({ json: { projects: [], hasKey: false } });
    if (url.pathname === '/media') return route.fulfill({ status: 204 });
    if (url.pathname === '/api/save') {
      if (state.failNextSave) {
        state.failNextSave = false;
        return route.fulfill({ status: 500, json: { error: '保存测试失败' } });
      }
      state.saves.push(request.postDataJSON());
      return route.fulfill({ json: { ok: true } });
    }
    if (url.pathname === '/api/export') return route.fulfill({ json: { job: 'export' } });
    if (url.pathname === '/api/compose') return route.fulfill({ json: { job: 'compose' } });
    if (url.pathname === '/api/suggest') {
      state.suggestCalls++;
      return route.fulfill({ json: { job: 'suggest' } });
    }
    if (url.pathname === '/api/job') {
      let result;
      if (url.searchParams.get('id') === 'export') result = { count: 1, folder: '/private/导出素材/20261104_123456_abcdef' };
      if (url.searchParams.get('id') === 'compose') result = { ...sample.outputs[0], file: '/private/成片.mp4' };
      if (url.searchParams.get('id') === 'suggest') result = {
        mode: 'continuous', clips: [
          { start: 0, end: 2.1, english: 'How was your weekend?', chinese: '周末怎么样？' },
          { start: 2.1, end: 5.5, english: 'I had a great time.', chinese: '我过得很开心。' },
        ],
      };
      return route.fulfill({ json: { state: 'done', message: '完成', result } });
    }
    return route.fulfill({ status: 404, json: { error: 'unexpected request' } });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:9999/?token=test');
  await page.evaluate(data => load(data), structuredClone(sample));
  return { context, page, errors, state };
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const width of [320, 390]) {
      const { context, page, errors, state } = await openPage(browser, true, width);
      assert.match(await page.locator('#platformBadge').textContent(), /Android/);
      assert.equal(await page.locator('#openOutput').isVisible(), false);
      assert.equal(await page.locator('#mobileNav').isVisible(), true);
      await page.locator('#mobileRange').click();
      await page.locator('.sub').nth(1).click();
      await page.locator('.sub').nth(0).click();
      assert.equal(await page.locator('#mobileSelectionCount').innerText(), '已选 2 句');
      assert.equal(await page.locator('#english').inputValue(), 'How was your weekend? I had a great time.');
      assert.equal(await page.locator('#start').inputValue(), '0.500');
      assert.equal(await page.locator('#end').inputValue(), '4.500');
      await page.locator('#mobileEditSelection').click();
      assert.equal(await page.locator('#video').isVisible(), true);
      await page.locator('#preview').click();
      assert.equal(await page.evaluate(() => window.played), 1);
      assert.equal(await page.evaluate(() => document.querySelector('#video').currentTime), 0.5);
      await page.locator('#chinese').fill('你周末过得怎么样？');
      await page.locator('#chinese').blur();
      await page.locator('#mobileNav [data-mobile-screen="source"]').click();
      page.once('dialog', dialog => dialog.dismiss());
      await page.locator('.sub').nth(2).click();
      assert.equal(await page.locator('#mobileSelectionCount').innerText(), '已选 2 句');
      assert.equal(await page.locator('#chinese').inputValue(), '你周末过得怎么样？');
      await page.locator('#mobileNav [data-mobile-screen="edit"]').click();
      state.failNextSave = true;
      await page.locator('#mobileSave').click();
      await page.locator('#status').filter({ hasText: '保存测试失败' }).waitFor();
      assert.equal(await page.evaluate(() => project.clips.length), 1);
      await page.locator('#mobileSave').click();
      await page.locator('#status').filter({ hasText: '选段已保存' }).waitFor();
      assert.equal(await page.evaluate(() => project.clips.length), 2);
      assert.equal(state.saves[0].clips.length, 2);

      await page.locator('#suggest').click();
      assert.equal(state.suggestCalls, 0);
      await page.locator('#generateSegments').click();
      await page.locator('.ai-row').first().waitFor();
      assert.equal(state.suggestCalls, 1);
      page.once('dialog', dialog => dialog.accept());
      await page.locator('#replaceSegments').click();
      await page.locator('#clipsSection').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#fullCoverage').isChecked(), true);
      await page.locator('#export').click();
      await page.waitForFunction(() => window.saved.some(item => item.folder));
      await page.locator('#compose').click();
      await page.locator('#outputNotice').filter({ hasText: '合成完成' }).waitFor();
      assert.equal(await page.locator('#outputSection').isVisible(), true);
      await page.locator('[data-save-output]').first().click();
      assert.deepEqual(await page.evaluate(() => window.saved.find(item => item.id)), {
        id: '20261104_123456_abcdef', name: '成片_横版.mp4',
      });
      await page.locator('#mobileSettings').click();
      await page.locator('#mobileCheckUpdates').click();
      assert.deepEqual(await page.evaluate(() => window.saved.find(item => item.checked)), { checked: true });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual(errors, []);
      await context.close();
    }

    const desktop = await openPage(browser, false);
    assert.match(await desktop.page.locator('#platformBadge').innerText(), /Windows/);
    assert.equal(await desktop.page.locator('#mobileNav').isVisible(), false);
    assert.equal(await desktop.page.locator('#openOutput').isVisible(), true);
    assert.equal(await desktop.page.locator('[data-save-output]').count(), 0);
    await desktop.page.locator('.sub').nth(0).click();
    await desktop.page.locator('.sub').nth(1).click({ modifiers: ['Shift'] });
    assert.equal(await desktop.page.locator('#english').inputValue(), 'How was your weekend? I had a great time.');
    assert.deepEqual(desktop.errors, []);
    await desktop.context.close();
    console.log('Android touch workflow and Windows selection: PASS (mocked browser interfaces)');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
