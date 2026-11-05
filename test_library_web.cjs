// 合成数据验证素材库页面，不访问真实素材、API 或密钥。
const {chromium}=require('playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');

(async()=>{
  const mediaFolder=fs.mkdtempSync(path.join(os.tmpdir(),'grammar-library-web-'));
  const mediaPath=path.join(mediaFolder,'synthetic.mp4');
  execFileSync(path.resolve('tools/ffmpeg.exe'),['-hide_banner','-loglevel','error','-f','lavfi','-i',
    'testsrc2=size=480x270:rate=24:duration=12','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',mediaPath],{windowsHide:true});
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1500,height:1050}});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    const state={key:false,saved:[],topic:null,analyze:null};
    const source={id:'0123456789abcdef',title:'Weekend in London',done:0,batches:2,sentences:0,available:true,error:''};
    let items=[
      {id:1,source_id:source.id,title:source.title,start:1.2,end:4.5,english:'Have you ever been to London?',chinese:'你去过伦敦吗？',grammar:['现在完成时','疑问句'],patterns:['Have you ever…?']},
      {id:2,source_id:source.id,title:'A quiet morning',start:6,end:9,english:'I have never tried this before.',chinese:'我以前从未试过这个。',grammar:['现在完成时'],patterns:['I have never + 过去分词']},
    ];
    page.on('dialog',dialog=>dialog.accept());
    await page.route('**/*',async route=>{
      const url=new URL(route.request().url()),path=url.pathname;
      if(path==='/library')return route.fulfill({contentType:'text/html',body:fs.readFileSync('web/library.html','utf8')});
      if(path==='/api/library/sources')return route.fulfill({json:{sources:[source],grammar:['现在完成时','疑问句','条件句'],hasKey:state.key}});
      if(path==='/api/library/search'){
        const query=url.searchParams.get('q')||'';
        const result=items.filter(x=>x.english.toLowerCase().includes(query.toLowerCase())||x.chinese.includes(query));
        return route.fulfill({json:{items:result,total:result.length}});
      }
      if(path==='/api/key'){state.key=true;return route.fulfill({json:{ok:true}})}
      if(path==='/api/library/update'){
        const body=route.request().postDataJSON();state.saved.push(body);
        items=items.map(x=>x.id===body.id?body:x);return route.fulfill({json:{ok:true}});
      }
      if(path==='/api/library/analyze'){state.analyze=route.request().postDataJSON();return route.fulfill({json:{job:'analysis'}})}
      if(path==='/api/library/topic'){state.topic=route.request().postDataJSON();return route.fulfill({json:{job:'topic'}})}
      if(path==='/api/job'){
        if(url.searchParams.get('id')==='topic')return route.fulfill({json:{state:'done',message:'完成',result:{id:'abcdef0123456789',title:'完成时专题'}}});
        source.done=2;source.sentences=2;return route.fulfill({json:{state:'done',message:'完成',result:{errors:[],tokens:20}}});
      }
      if(path==='/')return route.fulfill({contentType:'text/html',body:'<h1>专题素材制作</h1>'});
      if(path==='/library-media')return route.fulfill({contentType:'video/mp4',body:fs.readFileSync(mediaPath)});
      throw Error('Unexpected route '+path);
    });
    await page.goto('http://127.0.0.1:8765/library?token=synthetic-token');
    await page.locator('#count').filter({hasText:'共 2 条'}).waitFor();
    await page.locator('#settings').click();
    await page.locator('#key').fill('synthetic-placeholder');
    await page.locator('#saveKey').click();
    await page.locator('#settingsDialog').waitFor({state:'hidden'});
    assert.equal(await page.locator('#key').inputValue(),'');
    assert.match(await page.locator('#keyStatus').innerText(),/密钥已保存/);
    await page.locator('#sourceSummary').click();
    await page.locator('#selectAll').click();
    await page.locator('#analyze').click();
    await page.locator('#status').filter({hasText:'20 Token'}).waitFor();
    assert.deepEqual(state.analyze.ids,[source.id]);
    await page.locator('[data-preview="1"]').click();
    await page.waitForFunction(()=>document.getElementById('video').readyState>=2);
    await page.locator('#preview').click();
    await page.waitForFunction(()=>document.getElementById('video').currentTime>=Number(document.getElementById('end').value)&&document.getElementById('video').paused);
    await page.locator('#end').fill('4.8');
    await page.locator('#chinese').fill('你曾经去过伦敦吗？');
    await page.locator('#editPatterns').fill('Have you ever + 过去分词, before?');
    await page.locator('#add').click();
    await page.locator('#basketCount').filter({hasText:'1'}).waitFor();
    assert.equal(state.saved[0].end,4.8);
    assert.deepEqual(state.saved[0].patterns,['Have you ever + 过去分词, before?']);
    await page.locator('[data-preview="2"]').click();
    await page.locator('#add').click();
    await page.locator('#basketCount').filter({hasText:'2'}).waitFor();
    await page.locator('[data-move="1"][data-step="-1"]').click();
    await page.reload();
    await page.locator('#count').filter({hasText:'共 2 条'}).waitFor();
    assert.match(await page.locator('.basket-item').first().innerText(),/I have never/);
    await page.locator('[data-preview="1"]').click();
    await page.locator('#query').fill('have you ever');
    await page.locator('#search').click();
    await page.locator('#count').filter({hasText:'共 1 条'}).waitFor();
    await page.locator('#query').fill('');await page.locator('#search').click();
    await page.locator('#count').filter({hasText:'共 2 条'}).waitFor();
    const screenshot=process.env.LIBRARY_SCREENSHOT;
    if(screenshot)await page.screenshot({path:screenshot,fullPage:true});
    await page.setViewportSize({width:1000,height:900});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.locator('#topicTitle').fill('完成时专题');
    await page.locator('#createTopic').click();
    await page.waitForURL('**/?token=*&project=abcdef0123456789');
    assert.deepEqual(state.topic.ids,[2,1]);
    assert.equal(state.topic.title,'完成时专题');
    assert.deepEqual(errors,[]);
    console.log('Library GUI passed: settings, analysis, preview, edit, search, persistent ordering, topic navigation and responsive layout.');
  }finally{await browser.close();fs.rmSync(mediaFolder,{recursive:true,force:true})}
})().catch(error=>{console.error(error);process.exitCode=1});
