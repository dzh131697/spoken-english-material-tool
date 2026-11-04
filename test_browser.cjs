const { chromium } = require('playwright');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = __dirname;
const bundle = path.join(root, 'dist', '启动工具');
const fixtures = path.join(root, 'qa');
fs.mkdirSync(fixtures, { recursive: true });
const profile = fs.mkdtempSync(path.join(fixtures, 'test-profile-'));
const video = path.join(fixtures, '口语示例.mp4');
const subs = path.join(fixtures, '英文字幕.srt');
execFileSync(path.join(bundle, 'tools', 'ffmpeg.exe'), [
  '-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=25:d=6',
  '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', '-c:v', 'libx264',
  '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', video,
], { windowsHide: true });
fs.writeFileSync(subs, '1\n00:00:00,500 --> 00:00:02,000\nHow was your weekend?\n\n' +
  '2\n00:00:02,200 --> 00:00:04,500\nI had a great time.\n\n' +
  '3\n00:00:04,500 --> 00:00:05,500\nWhat about you?\n', 'utf8');

async function start() {
  const child = spawn(path.join(bundle, '启动工具.exe'), ['--no-browser'], {
    cwd: bundle, windowsHide: true, env: { ...process.env, LOCALAPPDATA: profile },
  });
  const url = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(Error('启动超时 ' + output)), 20000);
    child.stdout.on('data', data => {
      output += data.toString();
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+/);
      if (match) { clearTimeout(timer); resolve(match[0]); }
    });
    child.on('exit', code => { clearTimeout(timer); reject(Error('程序退出 ' + code)); });
    child.stderr.on('data', data => process.stderr.write(data));
  });
  return { child, url };
}

async function request(page, url, endpoint, body) {
  const parsed = new URL(url);
  const headers = { 'X-App-Token': parsed.searchParams.get('token') };
  return body === undefined ? page.request.get(parsed.origin + endpoint, { headers }) :
    page.request.post(parsed.origin + endpoint, { headers, data: body });
}

(async () => {
  let running, browser;
  try {
    running = await start();
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(running.url);
    await page.locator('#videoFile').setInputFiles(video);
    await page.locator('#status').filter({ hasText: '视频已载入' }).waitFor();
    await page.locator('#subFile').setInputFiles(subs);
    await page.locator('.sub').first().waitFor();
    assert.equal(await page.locator('.sub').count(), 3);
    await page.locator('.sub').nth(0).click();
    await page.locator('.sub').nth(1).click({ modifiers: ['Shift'] });
    assert.equal(await page.locator('#english').inputValue(), 'How was your weekend? I had a great time.');
    assert.equal(await page.locator('#start').inputValue(), '0.500');
    assert.equal(await page.locator('#end').inputValue(), '4.500');

    await page.locator('#chinese').fill('你周末过得怎么样？\n我过得很开心。');
    for (const theme of ['midnight', 'paper', 'studio']) {
      await page.locator('#theme').selectOption(theme);
      await page.locator('#showCard').click();
      await page.locator('#cardPreview').waitFor({ state: 'visible' });
      await page.locator('#cardPreview').screenshot({ path: path.join(fixtures, `题卡_${theme}.png`) });
      await page.locator('#closeCard').click();
    }
    await page.locator('#add').click();
    await page.locator('.clip').waitFor();
    await page.locator('#export').click();
    await page.locator('#status').filter({ hasText: '已导出 1 段素材' }).waitFor({ timeout: 30000 });
    const folder = (await page.locator('#status').innerText()).split('\n')[1];
    assert(fs.existsSync(path.join(folder, '001_原视频.mp4')));
    assert(fs.existsSync(path.join(folder, '001_中文题卡.png')));

    let calls = 0;
    await page.route('**/api/suggest', async route => {
      calls++;
      await route.fulfill({ json: { job: 'mock-ai' } });
    });
    await page.route('**/api/job?id=mock-ai', async route => {
      await route.fulfill({ json: { state: 'done', message: '完成', result: {
        mode: 'continuous', duration: 6, tokens: 40, clips: [
          { start: 0, end: 2.1, english: 'How was your weekend?', chinese: '你周末过得怎么样？' },
          { start: 2.1, end: 6, english: 'I had a great time. What about you?', chinese: '我过得很开心。你呢？' },
        ],
      } } });
    });
    assert.equal(calls, 0);
    await page.locator('#suggest').click();
    assert.equal(calls, 0);
    await page.locator('#generateSegments').click();
    await page.locator('.ai-row').first().waitFor();
    assert.equal(calls, 1);
    assert.equal(await page.locator('.ai-row').count(), 2);
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#replaceSegments').click();
    await page.waitForFunction(() => document.querySelectorAll('.clip').length === 2);
    assert.equal(await page.locator('#fullCoverage').isChecked(), true);

    await page.locator('#cardSeconds').fill('1');
    await page.locator('#compose').click();
    await page.locator('#outputNotice').filter({ hasText: '合成完成' }).waitFor({ timeout: 120000 });
    await page.locator('[data-output]').first().click();
    await page.locator('#outputVideo').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelector('#outputVideo').readyState >= 2);
    await page.screenshot({ path: path.join(fixtures, '工作台_桌面.png'), fullPage: true });

    const project = await page.locator('#projects').inputValue();
    await request(page, running.url, '/api/key', { key: 'not-a-real-key' });
    const encrypted = path.join(profile, 'SpokenEnglishMaterialTool', 'deepseek.key');
    assert(fs.existsSync(encrypted));
    assert(!fs.readFileSync(encrypted).includes(Buffer.from('not-a-real-key')));
    await request(page, running.url, '/api/shutdown', {});
    await new Promise(resolve => running.child.once('exit', resolve));
    running = await start();
    await page.goto(running.url);
    await page.locator('#projects').selectOption(project);
    await page.locator('[data-output]').first().waitFor();
    assert.equal(await page.locator('#fullCoverage').isChecked(), true);
    const response = await request(page, running.url, '/api/projects');
    assert.equal((await response.json()).hasKey, true);
    await request(page, running.url, '/api/key-clear', {});
    assert(!fs.existsSync(encrypted));
    assert.deepEqual(errors, []);

    await page.setViewportSize({ width: 420, height: 900 });
    await page.screenshot({ path: path.join(fixtures, '工作台_窄屏.png'), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await request(page, running.url, '/api/shutdown', {});
    console.log(JSON.stringify({ result: 'PASS', checks: ['导入和选择字幕', '三个题卡模板', '主动触发 AI 并审核',
      '真实合成和页面预览', '成片记录重启恢复', '密钥加密与删除', '窄屏布局'], folder }, null, 2));
  } finally {
    await browser?.close();
    running?.child.kill();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
