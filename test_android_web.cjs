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

const defaultPreferences={theme:'midnight',ratio:'landscape',card:5,sound:'none',versions:['plain']};

async function openPage(browser, android, width = 390) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: android });
  await context.addInitScript(isAndroid => {
    window.saved = [];
    window.played = 0;
    window.copied = [];
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => window.copied.push(text) } });
    Object.defineProperty(HTMLMediaElement.prototype, 'duration', { get: () => 100, configurable: true });
    HTMLMediaElement.prototype.play = function () { window.played++; return Promise.resolve(); };
    HTMLMediaElement.prototype.pause = function () {};
    if (isAndroid) {
      window.AndroidHost = {
        saveVideo: (id, name) => window.saved.push({ id, name }),
        savePublicationFile: (id, name) => window.saved.push({ publication: id, name }),
        saveBatch: folder => window.saved.push({ folder }),
        closeApp: () => window.saved.push({ closed: true }),
        checkForUpdates: () => window.saved.push({ checked: true }),
      };
    }
  }, android);
  const state = { preferences: structuredClone(defaultPreferences), preferenceWrites: [], exportCalls: 0, pollFailures: 0, polledJobs: [], jobError: null, composeCalls: [], saves: [], failNextSave: false, suggestCalls: 0, publicationSaves: {}, frames: [], generations: [], cards: [], deleted: [] };
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: html });
    if (url.pathname === '/publish.js' || url.pathname === '/publish.css') return route.fulfill({
      contentType: url.pathname.endsWith('.js') ? 'text/javascript' : 'text/css',
      body: fs.readFileSync('web' + url.pathname, 'utf8'),
    });
    if (url.pathname === '/api/projects') return route.fulfill({ json: { projects: [], hasKey: false, productionPreferences: state.preferences } });
    if (url.pathname === '/api/production-preferences') { const body=request.postDataJSON(); state.preferenceWrites.push(body); state.preferences=Object.keys(body).length?body:structuredClone(defaultPreferences); return route.fulfill({json:state.preferences}); }
    if (url.pathname === '/api/card-preview') {
      state.cards.push(request.postDataJSON());
      return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#305b48"/></svg>' });
    }
    if (url.pathname === '/api/delete-output') {
      state.deleted.push(request.postDataJSON());
      const outputs = await page.evaluate(id => project.outputs.filter(item => item.id !== id), request.postDataJSON().output);
      return route.fulfill({ json: { outputs } });
    }
    if (url.pathname === '/media') return route.fulfill({ status: 204 });
    if (url.pathname === '/publish-asset') return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1440"><rect width="1080" height="1440" fill="#d8e6d9"/><text x="80" y="700" fill="#254c36" font-size="100">口语练习</text></svg>'});
    if (url.pathname === '/api/waveform') {
      const body = request.postDataJSON();
      return route.fulfill({ json: { from: body.from, to: body.to, peaks: [0,.2,.8,.4,0], threshold: .3 } });
    }
    if (url.pathname === '/publish-source' || url.pathname === '/output-media') return route.fulfill({ status: 204 });
    if (url.pathname === '/api/publish-frame') {
      const body = request.postDataJSON(); state.frames.push(body);
      return route.fulfill({ contentType: 'image/svg+xml', headers: { 'X-Frame-Time': String(body.mode === 'random' ? 1.25 : body.time) },
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect width="960" height="540" fill="#426b82"/><circle cx="710" cy="240" r="125" fill="#d5ad8b"/><rect x="580" y="360" width="250" height="180" fill="#233e4d"/></svg>' });
    }
    if (url.pathname === '/api/publish-save') {
      const body = request.postDataJSON();
      const publication = { ...body.publication, images: Object.keys(body.cover_images), updated: 1 };
      const output = { ...sample.outputs[0], id: body.output, publication };
      state.publicationSaves[body.output] = { body, output };
      return route.fulfill({ json: output });
    }
    if (url.pathname === '/api/publish-generate') {
      state.generations.push(request.postDataJSON());
      return route.fulfill({ json: { job: 'publication' } });
    }
    if (url.pathname === '/api/publish-folder') return route.fulfill({ json: { folder: '/private/导出素材/' + request.postDataJSON().output } });
    if (url.pathname === '/api/save') {
      if (state.failNextSave) {
        state.failNextSave = false;
        return route.fulfill({ status: 500, json: { error: '保存测试失败' } });
      }
      state.saves.push(request.postDataJSON());
      return route.fulfill({ json: { ok: true } });
    }
    if (url.pathname === '/api/export') { state.exportCalls++; return route.fulfill({ json: { job: 'export' } }); }
    if (url.pathname === '/api/compose') { state.composeCalls.push(request.postDataJSON()); return route.fulfill({ json: { job: 'compose' } }); }
    if (url.pathname === '/api/suggest') {
      state.suggestCalls++;
      return route.fulfill({ json: { job: 'suggest' } });
    }
    if (url.pathname === '/api/job') {
      state.polledJobs.push(url.searchParams.get('id'));
      if(state.pollFailures>0){state.pollFailures--;return route.abort('connectionrefused')}
      if(state.jobError)return route.fulfill({json:{state:'error',message:state.jobError}});
      let result;
      if (url.searchParams.get('id') === 'export') result = { count: 1, folder: '/private/导出素材/20261104_123456_abcdef' };
      if (url.searchParams.get('id') === 'compose') result = { ...sample.outputs[0], file: '/private/成片.mp4' };
      if (url.searchParams.get('id') === 'suggest') result = {
        mode: 'continuous', clips: [
          { start: 0, end: 2.1, english: 'How was your weekend?', chinese: '周末怎么样？' },
          { start: 2.1, end: 5.5, english: 'I had a great time.', chinese: '我过得很开心。' },
        ],
      };
      if (url.searchParams.get('id') === 'publication') result = { fields: { title: '模拟生成的标题' }, usage: { total_tokens: 30 } };
      return route.fulfill({ json: { state: 'done', message: '完成', result } });
    }
    return route.fulfill({ status: 404, json: { error: 'unexpected request' } });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:9999/?token=test');
  await page.waitForLoadState('networkidle');
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
      assert.equal(await page.locator('#cutDetails').evaluate(node=>node.open),false);
      await page.locator('#cutDetails summary').click();
      await page.locator('#waveA').waitFor({ state: 'visible' });
      assert((await page.locator('#waveA').boundingBox()).width>0);
      assert.equal(await page.locator('#video').isVisible(), true);
      await page.locator('#preview').click();
      assert.equal(await page.evaluate(() => window.played), 1);
      assert.equal(await page.evaluate(() => document.querySelector('#video').currentTime), 0.5);
      await page.locator('#cutDetails summary').click();
      await page.locator('#chinese').fill('你周末过得怎么样？');
      await page.locator('#chinese').blur();
      await page.locator('#mobileNav [data-mobile-screen="source"]').click();
      page.once('dialog', dialog => dialog.dismiss());
      await page.locator('.sub').nth(2).click();
      assert.equal(await page.locator('#mobileSelectionCount').innerText(), '已选 2 句');
      assert.equal(await page.locator('#chinese').inputValue(), '你周末过得怎么样？');
      await page.locator('#mobileNav [data-mobile-screen="edit"]').click();
      await page.locator('#showCard').click();
      await page.locator('#mobileCardImage').waitFor({state:'visible'});
      assert.equal(await page.locator('#video').isVisible(), false);
      const refresh = page.waitForResponse('**/api/card-preview');
      await page.locator('#chinese').fill('你周末过得怎么样？');
      await refresh;
      assert.equal(state.cards.at(-1).text, '你周末过得怎么样？');
      await page.screenshot({path:`qa/题卡同屏_${width}.png`});
      await page.locator('#closeMobileCard').click();
      assert.equal(await page.locator('#video').isVisible(), true);
      assert.equal(await page.locator('#videoSection').evaluate(node=>getComputedStyle(node).position), 'sticky');
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
      await page.locator('input[name="aiMode"][value="continuous"]').check();
      await page.locator('#generateSegments').click();
      await page.locator('.ai-row').first().waitFor();
      assert.equal(state.suggestCalls, 1);
      page.once('dialog', dialog => dialog.accept());
      await page.locator('#replaceSegments').click();
      await page.locator('#clipsSection').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#fullCoverage').isChecked(), true);
      await page.locator('#mobileComposeSettings summary').click();
      await page.locator('#cardTip').fill('现在轮到你啦');
      await page.locator('#cardTip').blur();
      await page.waitForFunction(() => !busy);
      assert.equal(state.saves.at(-1).card_tip, '现在轮到你啦');
      await page.locator('#export').click();
      await page.waitForFunction(() => window.saved.some(item => item.folder));
      await page.evaluate(()=>Object.defineProperty(document.querySelector('#video'),'duration',{get:()=>5.5,configurable:true}));
      await page.locator('#compose').click();
      assert.equal(state.composeCalls.length,0);
      assert.equal(await page.locator('#startCompose').isEnabled(),true);
      await page.locator('#startCompose').click();
      await page.locator('#outputNotice').filter({ hasText: '合成完成' }).waitFor();
      assert.equal(state.composeCalls.length,1);
      assert.deepEqual(state.composeCalls[0].versions,['plain']);
      assert.equal(state.composeCalls[0].continuous,true);
      assert.equal(state.composeCalls[0].tip,'现在轮到你啦');
      assert.equal(await page.locator('#outputSection').isVisible(), true);
      assert.equal(await page.locator('#outputList #outputVideo').isVisible(), true);
      await page.screenshot({path:`qa/成片卡片_${width}.png`});
      await page.locator('[data-save-output]').first().click();
      assert.deepEqual(await page.evaluate(() => window.saved.find(item => item.id)), {
        id: '20261104_123456_abcdef', name: '成片_横版.mp4',
      });
      await page.evaluate(()=>{project.outputs[0].files=[{name:'成片_横版.mp4',label:'无字幕'},{name:'成片_横版_双语字幕.mp4',label:'双语字幕'}];renderOutputs()});
      await page.locator('[data-version-select]').first().selectOption('成片_横版_双语字幕.mp4');
      assert.equal(new URL(await page.locator('#outputVideo').getAttribute('src'),'http://local').searchParams.get('file'),'成片_横版_双语字幕.mp4');
      await page.locator('[data-save-output]').first().click();
      assert.equal(await page.evaluate(()=>window.saved.at(-1).name),'成片_横版_双语字幕.mp4');
      await page.locator('#mobileSettings').click();
      await page.locator('#mobileCheckUpdates').click();
      assert.deepEqual(await page.evaluate(() => window.saved.find(item => item.checked)), { checked: true });
      await page.evaluate(() => {project.outputs.push({ ...project.outputs[0], id: '20261105_111111_abcdef' });renderOutputs()});
      await page.locator('[data-publish-output]').first().click();
      await page.waitForFunction(() => !busy && publishingFrame !== null);
      assert.equal(await page.locator('[data-publish-panel]:visible').count(), 1);
      assert.equal(await page.locator('#publishTitle').isVisible(), false);
      assert.equal(state.generations.length, 0);
      await page.locator('#coverFrameMode').selectOption('random');
      await page.waitForFunction(() => !busy);
      assert.equal(state.frames.at(-1).mode, 'random');
      await page.locator('[data-publish-tab="copy"]').click();
      await page.locator('#publishTitle').fill('第一条视频标题');
      await page.locator('#copyPublishTitle').click();
      await page.waitForFunction(() => window.copied.includes('第一条视频标题'));
      await page.locator('#publishDescription').fill('第一条视频的简介');
      await page.locator('#publishTags').fill('#英语口语 #真实表达');
      await page.locator('[data-publish-tab="reference"]').click();
      await page.locator('#publishSourceDescription').fill('这一条成片的参考内容');
      await page.locator('#publishPlatform').selectOption('xiaohongshu');
      assert.equal(await page.locator('#publishTitle').inputValue(), '');
      await page.locator('[data-publish-tab="copy"]').click();
      await page.locator('#publishTitle').fill('小红书标题');
      await page.locator('#publishPlatform').selectOption('bilibili');
      assert.equal(await page.locator('#publishTitle').inputValue(), '第一条视频标题');
      assert.equal(await page.locator('#publishDescription').inputValue(), '第一条视频的简介');
      assert.equal(await page.locator('#publishTags').inputValue(), '#英语口语 #真实表达');
      await page.locator('[data-publish-tab="cover"]').click();
      await page.locator('#coverTitle').fill('这句话英语怎么说');
      fs.mkdirSync('qa', { recursive: true });
      for (const style of ['viewfinder', 'magazine', 'note', 'pop', 'minimal']) {
        await page.locator(`[data-cover-style="${style}"]`).click();
        assert.equal(await page.evaluate(() => coverLayoutValid), true);
        if (width === 390) fs.writeFileSync(`qa/封面_${style}.png`, Buffer.from(await page.evaluate(() => document.querySelector('#coverCanvas').toDataURL().split(',')[1]), 'base64'));
      }
      await page.locator('#coverAdjustments > summary').click();
      const previewBefore=await page.locator('#coverCanvas').boundingBox();
      await page.locator('#coverFontScale').scrollIntoViewIfNeeded();
      const previewAfter=await page.locator('#coverCanvas').boundingBox();
      assert(Math.abs(previewBefore.y-previewAfter.y)<2,'滚动调整控件不应移走封面预览');
      const navBox=await page.locator('#mobileNav').boundingBox();
      assert(previewAfter.y>=0&&previewAfter.y+previewAfter.height<navBox.y,'封面应留在可见区域');
      await page.locator('#coverShowTitle').uncheck();
      assert.equal(await page.evaluate(() => activeCover().show_title), false);
      await page.locator('#coverShowTitle').check();
      for (const [ratio,size] of Object.entries({landscape:[1920,1080],landscape43:[1440,1080],landscape1610:[1920,1200],square:[1080,1080],portrait:[1080,1920]})) {
        await page.locator('#coverRatio').selectOption(ratio);
        await page.waitForFunction(() => !busy);
        assert.deepEqual(await page.locator('#coverCanvas').evaluate(node=>[node.width,node.height]), size);
        assert.equal(await page.evaluate(()=>coverLayoutValid),true);
      }
      await page.locator('#coverRatio').selectOption('portrait34');
      await page.waitForFunction(() => !busy);
      assert.deepEqual(await page.evaluate(() => [document.querySelector('#coverCanvas').width, document.querySelector('#coverCanvas').height]), [1080, 1440]);
      await page.locator('#savePublication').click();
      await page.locator('#publishSaved').filter({ hasText: '已保存' }).waitFor();
      const firstID = '20261104_123456_abcdef';
      assert.equal(state.publicationSaves[firstID].body.publication.platforms.bilibili.title, '第一条视频标题');
      assert.equal(state.publicationSaves[firstID].body.publication.platforms.xiaohongshu.title, '小红书标题');
      assert.equal(state.publicationSaves[firstID].body.publication.platforms.bilibili.description, '第一条视频的简介');
      assert.deepEqual(state.publicationSaves[firstID].body.publication.platforms.bilibili.tags, ['英语口语', '真实表达']);
      assert.deepEqual(Object.keys(state.publicationSaves[firstID].body.cover_images).sort(), ['landscape', 'landscape1610', 'landscape43', 'portrait', 'portrait34', 'square']);
      await page.locator('[data-publish-tab="copy"]').click();
      page.once('dialog', dialog => dialog.accept());
      await page.locator('[data-generate-publication="title"]').click();
      await page.locator('#publishTitle').filter({ visible: true }).waitFor();
      await page.waitForFunction(() => document.querySelector('#publishTitle').value === '模拟生成的标题' && !busy);
      assert.equal(state.generations[0].output, firstID);
      assert.equal(state.generations[0].source.description, '这一条成片的参考内容');
      await page.locator('#savePublication').click();
      await page.waitForFunction(() => !busy && !publishingDirty);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      for (const tab of ['cover', 'copy', 'reference']) {
        await page.locator(`[data-publish-tab="${tab}"]`).click();
        assert.equal(await page.locator('[data-publish-panel]:visible').count(), 1);
        assert.equal(await page.locator(`[data-publish-panel="${tab}"]`).isVisible(), true);
        assert.equal(await page.locator(`[data-publish-tab="${tab}"]`).getAttribute('aria-selected'), 'true');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.screenshot({ path: `qa/发布准备_${tab}_${width}.png` });
      }
      await page.locator('[data-publish-tab="copy"]').click();
      await page.locator('#publishTags').scrollIntoViewIfNeeded();
      assert.equal(await page.locator('#publishTags').isVisible(),true);
      const tagBox=await page.locator('#publishTags').boundingBox();
      const bottomNav=await page.locator('#mobileNav').boundingBox();
      assert(tagBox.y+tagBox.height<=bottomNav.y,'滚动后标签编辑区应完整露出，不被底栏遮挡');
      await page.locator('#publishPlatform').selectOption('xiaohongshu');
      await page.locator('#publishTitle').fill('字'.repeat(21));
      await page.locator('#savePublication').click();
      await page.locator('#status').filter({hasText:'超出字数限制'}).waitFor();
      await page.waitForFunction(()=>document.activeElement===document.querySelector('#publishTitle'));
      await page.locator('#publishTitle').fill('小红书标题');
      await page.locator('#savePublication').click();
      await page.waitForFunction(()=>!busy&&!publishingDirty);
      await page.locator('#publishBack').click();
      assert.equal(await page.locator('#publishList video').count(),0);
      assert.equal(await page.locator('#publishList [data-delete-output]').count(),0);
      await page.screenshot({path:`qa/发布卡片_${width}.png`});
      await page.locator('[data-edit-publication="20261105_111111_abcdef"]').click();
      await page.waitForFunction(() => !busy && publishingFrame !== null);
      assert.equal(await page.locator('#coverFrameMode').inputValue(), 'manual');
      assert.equal(await page.locator('#publishTitle').inputValue(), '');
      await page.locator('[data-publish-tab="copy"]').click();
      await page.locator('#publishTitle').fill('第二条视频标题');
      page.once('dialog', dialog => dialog.dismiss());
      await page.locator('#publishBack').click();
      assert.equal(await page.locator('#publishEditor').isVisible(), true);
      await page.locator('#savePublication').click();
      await page.waitForFunction(() => !busy && !publishingDirty);
      assert.equal(state.publicationSaves[firstID].output.publication.platforms.bilibili.title, '模拟生成的标题');
      assert.equal(state.publicationSaves['20261105_111111_abcdef'].output.publication.platforms.bilibili.title, '第二条视频标题');
      await page.locator('[data-publish-tab="cover"]').click();
      await page.locator('#downloadCover').click();
      await page.waitForFunction(() => window.saved.some(item => item.publication));
      assert.deepEqual(await page.evaluate(() => window.saved.find(item => item.publication)), { publication: '20261105_111111_abcdef', name: '封面_4比3.png' });
      await page.locator('#downloadPublication').click();
      await page.waitForFunction(() => window.saved.some(item => item.folder?.endsWith('20261105_111111_abcdef')));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.locator('#mobilePublishBack').click();
      await page.locator('[data-publication-package="20261105_111111_abcdef"]').click();
      await page.waitForFunction(()=>!busy);
      await page.locator('[data-mobile-screen="outputs"]').click();
      const toDelete='20261105_111111_abcdef';
      await page.locator(`[data-output-card="${toDelete}"] summary`).click();
      page.once('dialog',dialog=>dialog.dismiss());
      await page.locator(`[data-delete-output="${toDelete}"]`).click();
      assert.equal(state.deleted.length,0);
      page.once('dialog',dialog=>dialog.accept());
      await page.locator(`[data-delete-output="${toDelete}"]`).click();
      await page.waitForFunction(()=>!busy&&project.outputs.every(item=>item.id!=='20261105_111111_abcdef'));
      assert.equal(state.deleted[0].output,toDelete);
      assert.equal(await page.evaluate(()=>project.clips.length),2);
      await page.evaluate(()=>showMobilePage('edit'));
      await page.locator('#chinese').fill('清空预览测试');
      await page.locator('#showCard').click();
      await page.locator('#mobileCardImage').waitFor({state:'visible'});
      page.once('dialog',dialog=>dialog.accept());
      await page.locator('#new').click();
      assert.equal(await page.locator('#mobileCardPreview').isVisible(),false);
      assert.equal(await page.locator('#video').isVisible(),true);
      assert.deepEqual(errors, []);
      await context.close();
    }

    const desktop = await openPage(browser, false, 1366);
    await desktop.page.setViewportSize({width:1366,height:768});
    assert.match(await desktop.page.locator('#platformBadge').innerText(), /Windows/);
    assert.equal(await desktop.page.locator('#mobileNav').isVisible(), false);
    assert.equal(await desktop.page.locator('#openOutput').isVisible(), true);
    assert.equal(await desktop.page.locator('[data-save-output]').count(), 0);
    await desktop.page.evaluate(data => {
      data.subtitles = [{start:0,end:1,text:'Very good.'},{start:1.2,end:2,text:'Very good.'}];
      load(data);
    }, structuredClone(sample));
    await desktop.page.locator('.sub').nth(0).click();
    await desktop.page.locator('.sub').nth(1).click({ modifiers: ['Shift'] });
    assert.equal(await desktop.page.locator('#english').inputValue(), 'Very good. Very good.');
    await desktop.page.evaluate(data => load(data), structuredClone(sample));
    await desktop.page.locator('.sub').nth(0).click();
    await desktop.page.locator('.sub').nth(1).click({ modifiers: ['Shift'] });
    assert.equal(await desktop.page.locator('#english').inputValue(), 'How was your weekend? I had a great time.');
    await desktop.page.evaluate(()=>clearEditor());
    const editorBox=await desktop.page.locator('#editorSection').boundingBox();
    const subtitleBox=await desktop.page.locator('#subtitleSection').boundingBox();
    const videoBox=await desktop.page.locator('#videoSection').boundingBox();
    assert(Math.abs(editorBox.y-subtitleBox.y)<2&&Math.abs(editorBox.y-videoBox.y)<2,'桌面视频、字幕和编辑应并排');
    const saveBox=await desktop.page.locator('#add').boundingBox();
    const chineseBox=await desktop.page.locator('#chinese').boundingBox();
    assert(saveBox.y+saveBox.height<=768&&chineseBox.y+chineseBox.height<=768,'矮窗口应能看到中文和保存按钮');
    await desktop.page.screenshot({path:'qa/制作布局_1366.png'});
    await desktop.page.evaluate(()=>{project.clips[0].chinese='';renderClips()});
    await desktop.page.locator('#compose').click();
    assert.equal(await desktop.page.locator('#startCompose').isDisabled(),true);
    assert.match(await desktop.page.locator('#composeCheckList').innerText(),/第 1 段缺少中文/);
    assert.equal(desktop.state.composeCalls.length,0);
    await desktop.page.locator('[data-check-edit="0"]').click();
    assert.equal(await desktop.page.locator('#composeCheckDialog').isVisible(),false);
    assert.equal(await desktop.page.locator('#editLabel').innerText(),'编辑第 1 段');
    await desktop.page.evaluate(data=>{load(data);project.clips[0].end=101;renderClips()},structuredClone(sample));
    await desktop.page.locator('#compose').click();
    assert.equal(await desktop.page.locator('#startCompose').isDisabled(),true);
    assert.match(await desktop.page.locator('#composeCheckList').innerText(),/超出原视频/);
    await desktop.page.locator('#closeComposeCheck').click();
    await desktop.page.evaluate(data=>{load(data);project.clips.push({...project.clips[0]});renderClips()},structuredClone(sample));
    await desktop.page.locator('#compose').click();
    assert.match(await desktop.page.locator('#composeCheckList').innerText(),/时间重叠/);
    assert.equal(await desktop.page.locator('#startCompose').isEnabled(),true,'重复播放只提示，不阻止合成');
    await desktop.page.locator('#closeComposeCheck').click();
    await desktop.page.locator('#mobileComposeSettings summary').click();
    await desktop.page.locator('#cardSeconds').fill('0');
    await desktop.page.locator('#compose').click();
    assert.equal(await desktop.page.locator('#startCompose').isDisabled(),true);
    await desktop.page.locator('[data-check-settings]').first().click();
    assert.equal(await desktop.page.locator('#mobileComposeSettings').evaluate(node=>node.open),true);
    await desktop.page.locator('#cardSeconds').fill('7');
    await desktop.page.locator('#theme').selectOption('paper');
    await desktop.page.locator('#ratio').selectOption('portrait');
    await desktop.page.locator('#mobileComposeSettings summary').click();
    await desktop.page.locator('#mobileComposeSettings summary').click();
    assert.equal(await desktop.page.locator('#cardSeconds').inputValue(),'7');
    assert.equal(await desktop.page.locator('#theme').inputValue(),'paper');
    assert.match(await desktop.page.locator('#composeSummary').innerText(),/竖版/);
    await desktop.page.evaluate(data=>{load(data);document.querySelectorAll('[data-version-out]').forEach(input=>input.checked=false)},structuredClone(sample));
    await desktop.page.locator('#compose').click();
    assert.equal(await desktop.page.locator('#startCompose').isDisabled(),true);
    assert.match(await desktop.page.locator('#composeCheckList').innerText(),/至少勾选一种输出/);
    await desktop.page.locator('#closeComposeCheck').click();
    await desktop.page.evaluate(()=>{$('verPlain').checked=true;$('fullCoverage').checked=true});
    await desktop.page.locator('#compose').click();
    assert.equal(await desktop.page.locator('#startCompose').isDisabled(),true);
    assert.match(await desktop.page.locator('#composeCheckList').innerText(),/未连续覆盖/);
    await desktop.page.locator('#closeComposeCheck').click();
    await desktop.page.evaluate(data=>{load(data);editIndex=0},structuredClone(sample));
    await desktop.page.locator('#compose').click();
    assert.equal(await desktop.page.locator('#startCompose').isDisabled(),true);
    assert.match(await desktop.page.locator('#composeCheckList').innerText(),/尚未保存/);
    assert.equal(desktop.state.composeCalls.length,0);
    await desktop.page.locator('#closeComposeCheck').click();
    await desktop.page.evaluate(data=>load(data),structuredClone(sample));
    await desktop.page.locator('#publishingTab').click();
    await desktop.page.locator('[data-edit-publication]').click();
    await desktop.page.waitForFunction(() => !busy && publishingFrame !== null);
    assert.equal(await desktop.page.locator('#productionPage').isVisible(), false);
    await desktop.page.locator('[data-publish-tab="title"]').focus();
    await desktop.page.keyboard.press('ArrowRight');
    assert.equal(await desktop.page.locator('#publishDescription').isVisible(), true);
    await desktop.page.keyboard.press('End');
    assert.equal(await desktop.page.locator('#publishSourceURL').isVisible(), true);
    await desktop.page.keyboard.press('Home');
    assert.equal(await desktop.page.locator('#coverCanvas').isVisible(), true);
    await desktop.page.locator('[data-publish-tab="title"]').click();
    await desktop.page.locator('#publishPlatform').selectOption('xiaohongshu');
    await desktop.page.locator('#publishTitle').fill('字'.repeat(21));
    await desktop.page.locator('[data-publish-tab="reference"]').click();
    await desktop.page.locator('#savePublication').click();
    await desktop.page.locator('#status').filter({ hasText: '超出字数限制' }).waitFor();
    assert.equal(await desktop.page.locator('#publishTitle').isVisible(), true);
    assert.equal(Object.keys(desktop.state.publicationSaves).length, 0);
    await desktop.page.locator('#publishTitle').fill('桌面端发布标题');
    await desktop.page.locator('#savePublication').click();
    await desktop.page.waitForFunction(() => !busy && !publishingDirty);
    assert.equal(await desktop.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await desktop.page.locator('#publishBack').click();
    desktop.page.once('dialog',dialog=>dialog.accept());
    await desktop.page.locator('#publishList [data-delete-output]').click();
    await desktop.page.waitForFunction(()=>!busy&&project.outputs.length===0);
    await desktop.page.screenshot({ path: 'qa/发布准备_桌面.png', fullPage: true });
    assert.deepEqual(desktop.errors, []);
    await desktop.context.close();
    for(const android of [false,true]){
      const {page,context,state,errors}=await openPage(browser,android,android?390:1366);
      if(android)await page.evaluate(()=>showMobilePage('clips'));
      await page.locator('#mobileComposeSettings summary').click();
      await page.locator('#theme').selectOption('paper');
      await page.locator('#ratio').selectOption('portrait');
      await page.locator('#cardSeconds').fill('9');
      await page.locator('#cardSound').selectOption('countdown');
      await page.locator('#verEn').check();
      await page.locator('#saveProductionPreferences').click();
      await page.waitForFunction(()=>!busy);
      assert.deepEqual(state.preferences,{theme:'paper',ratio:'portrait',card:9,sound:'countdown',versions:['plain','en']});
      assert.deepEqual(Object.keys(state.preferenceWrites[0]).sort(),['card','ratio','sound','theme','versions']);
      await page.reload();await page.waitForLoadState('networkidle');
      assert.equal(await page.locator('#theme').inputValue(),'paper');
      assert.equal(await page.locator('#ratio').inputValue(),'portrait');
      assert.equal(await page.locator('#cardSeconds').inputValue(),'9');
      assert.equal(await page.locator('#cardSound').inputValue(),'countdown');
      assert.equal(await page.locator('#verEn').isChecked(),true);
      await page.evaluate(data=>{data.card_tip='独立题卡文案';data.continuous=true;load(data)},structuredClone(sample));
      if(android)await page.evaluate(()=>showMobilePage('clips'));
      await page.locator('#mobileComposeSettings summary').click();
      await page.locator('#resetProductionPreferences').click();
      await page.waitForFunction(()=>!busy);
      assert.deepEqual(state.preferences,defaultPreferences);
      assert.equal(await page.locator('#theme').inputValue(),'midnight');
      assert.equal(await page.locator('#cardTip').inputValue(),'独立题卡文案');
      assert.equal(await page.locator('#fullCoverage').isChecked(),true);
      assert.equal(await page.evaluate(()=>project.clips.length),1);
      state.pollFailures=3;
      const before=state.exportCalls;
      await page.locator('#export').click();
      await page.locator('#reconnectJob').waitFor({state:'visible'});
      assert.equal(await page.locator('#reconnectJob').isEnabled(),true);
      assert.equal(state.exportCalls,before+1);
      assert.notEqual(await page.locator('#taskElapsed').innerText(),'0 秒');
      assert.match(await page.locator('#taskMessage').innerText(),/不会重复提交/);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#taskDialog').isVisible(),true);
      await page.screenshot({path:android?'qa/任务断连_手机.png':'qa/任务断连_电脑.png'});
      await page.locator('#reconnectJob').click();
      await page.locator('#taskDialog').waitFor({state:'hidden'});
      await page.waitForFunction(()=>!busy);
      assert.equal(state.exportCalls,before+1,'重连只能查询原任务，不能重新提交');
      assert(state.polledJobs.every(id=>id==='export'));
      assert.match(await page.locator('#status').innerText(),/已导出/);
      const clips=await page.evaluate(()=>JSON.stringify(project.clips));
      state.jobError='模拟导出失败';
      await page.locator('#export').click();
      await page.locator('#status').filter({hasText:'模拟导出失败'}).waitFor();
      await page.waitForFunction(()=>!busy);
      assert.equal(await page.locator('#taskDialog').isVisible(),false);
      assert.equal(state.exportCalls,before+2);
      assert.equal(await page.evaluate(()=>JSON.stringify(project.clips)),clips);
      assert.deepEqual(errors,[]);
      await context.close();
    }
    console.log('Android touch workflow and Windows selection: PASS (mocked browser interfaces)');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
