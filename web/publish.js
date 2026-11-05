// 每条成片的发布资料独立保存；这里只编辑当前成片的副本。
$('publishSection').innerHTML = `
<div class="sectionhead wrap"><div><h2>发布准备</h2><p class="muted">每条成片独立保存封面、标题、简介和标签。</p></div><button id="publishBack" class="quiet hidden">返回成片卡片</button></div>
<div id="publishList" class="publish-list"><p class="muted">合成视频后，在这里准备发布资料。</p></div>
<div id="publishEditor" class="hidden">
  <div class="publish-identity"><strong id="publishName"></strong><small id="publishIdentity"></small><span id="publishSaved" role="status"></span></div>
  <div class="publish-editor-nav">
    <div class="publish-toolbar"><label class="platform-picker"><span>发布平台</span><select id="publishPlatform" aria-label="发布平台"><option value="bilibili">B站</option><option value="douyin">抖音</option><option value="xiaohongshu">小红书</option><option value="other">其他平台</option></select></label><div class="row"><button id="savePublication" class="primary">保存全部</button><button id="downloadPublication">导出发布包</button></div></div>
    <nav class="publish-tabs" role="tablist" aria-label="发布资料分类">
      <button id="publishTab-cover" role="tab" data-publish-tab="cover" aria-controls="publishPanel-cover" aria-selected="true">封面</button>
      <button id="publishTab-title" role="tab" data-publish-tab="title" aria-controls="publishPanel-title" aria-selected="false" tabindex="-1">标题</button>
      <button id="publishTab-description" role="tab" data-publish-tab="description" aria-controls="publishPanel-description" aria-selected="false" tabindex="-1">简介</button>
      <button id="publishTab-tags" role="tab" data-publish-tab="tags" aria-controls="publishPanel-tags" aria-selected="false" tabindex="-1">标签</button>
      <button id="publishTab-reference" role="tab" data-publish-tab="reference" aria-controls="publishPanel-reference" aria-selected="false" tabindex="-1">参考</button>
    </nav>
  </div>
  <section id="publishPanel-cover" data-publish-panel="cover" role="tabpanel" aria-labelledby="publishTab-cover">
  <div class="publish-panel-intro"><h3>设计视频封面</h3><p class="hint">选画面、换样式，再填写一句醒目的文案。</p></div>
  <div class="publish-layout">
    <div class="cover-preview"><div class="cover-canvas-wrap"><canvas id="coverCanvas" width="1920" height="1080" aria-label="封面实时预览"></canvas></div><p id="coverLayoutHint" class="hint" role="status"></p><button id="downloadCover">导出当前封面</button></div>
    <div class="publish-controls">
      <div class="publish-grid"><label>封面画幅<select id="coverRatio"><option value="landscape">横版 16:9</option><option value="portrait">竖版 9:16</option><option value="portrait34">竖版 3:4</option></select></label><label>选帧方式<select id="coverFrameMode"><option value="manual">手动选帧</option><option value="random">自动随机选帧</option></select></label></div>
      <details id="manualFrameControls" class="publish-group"><summary>手动选择视频画面</summary><video id="coverSourceVideo" controls preload="metadata" aria-label="选择封面帧的原视频"></video><div class="row wrap"><label>时间 / 秒 <input id="coverFrameTime" type="number" min="0" step="0.01" value="0"></label><button id="captureCoverFrame">使用此刻画面</button></div></details>
      <button id="randomCoverFrame" class="hidden">随机选一帧 / 换一帧</button><p id="coverFrameHint" class="hint">选择画面后，可继续修改裁切、文字和装饰。</p>
      <details class="publish-group" open><summary>样式与封面文案</summary>
      <div class="cover-styles" role="group" aria-label="封面样式"><button data-cover-style="viewfinder">取景框</button><button data-cover-style="magazine">杂志</button><button data-cover-style="note">便签</button><button data-cover-style="pop">撞色</button><button data-cover-style="minimal">极简</button></div>
      <label class="label" for="coverTitle">封面主文案 <small id="coverTitleCount"></small></label><textarea id="coverTitle" rows="2" placeholder="建议 6–16 字，最多 32 字、两行"></textarea>
      <label class="label" for="coverSubtitle">封面副文案 <small id="coverSubtitleCount"></small></label><input id="coverSubtitle" class="wide" placeholder="可留空，最多 40 字">
      <label class="label" for="coverBadge">小标签 <small id="coverBadgeCount"></small></label><input id="coverBadge" class="wide" placeholder="例如：真实口语，最多 12 字">
      <button id="generateCoverText">AI 生成封面文案</button>
      </details>
      <details id="coverAdjustments" class="publish-group"><summary>装饰与画面精调</summary>
        <div class="publish-checks"><label><input id="coverShowTitle" type="checkbox">主文案</label><label><input id="coverShowSubtitle" type="checkbox">副文案</label><label><input id="coverShowBadge" type="checkbox">小标签</label><label><input id="coverShowFrame" type="checkbox">角框 / 装饰</label><label><input id="coverShowPanel" type="checkbox">文字底板</label><label><input id="coverShowGradient" type="checkbox">渐变遮罩</label><label><input id="coverShadow" type="checkbox">文字阴影</label></div>
        <p class="hint">画面裁切</p><div class="publish-grid"><label>画面左右<input id="coverCropX" type="range" min="0" max="100" value="50"></label><label>画面上下<input id="coverCropY" type="range" min="0" max="100" value="50"></label><label>画面放大<input id="coverZoom" type="range" min="1" max="2" step="0.01" value="1"></label></div>
        <p class="hint">文字排版</p><div class="publish-grid"><label>文字左右<input id="coverTextX" type="range" min="0" max="100" value="0"></label><label>文字上下<input id="coverTextY" type="range" min="0" max="100" value="72"></label><label>字号<input id="coverFontScale" type="range" min="0.6" max="1.4" step="0.05" value="1"></label><label>文字颜色<input id="coverTextColor" type="color" value="#ffffff"></label><label>装饰颜色<input id="coverAccent" type="color" value="#a8dfbd"></label></div>
      </details>
    </div>
  </div>
  </section>
  <section id="publishPanel-title" class="publish-copy hidden" data-publish-panel="title" role="tabpanel" aria-labelledby="publishTab-title">
    <div class="publish-panel-intro"><h3>写一个清楚的标题</h3><p class="hint">手动填写或让 AI 提供灵感，切换平台保留各自标题。</p></div>
    <div class="sectionhead"><label for="publishTitle">视频标题 <small id="publishTitleCount"></small></label><button data-generate-publication="title" class="quiet">AI 生成标题</button></div><textarea id="publishTitle" rows="3" placeholder="让观众一眼知道这条视频练什么"></textarea>
    <p class="hint">字数上限随发布平台变化，实际要求以平台发布页为准。</p><button id="copyPublishTitle">复制标题</button>
  </section>
  <section id="publishPanel-description" class="publish-copy hidden" data-publish-panel="description" role="tabpanel" aria-labelledby="publishTab-description">
    <div class="publish-panel-intro"><h3>介绍这条视频</h3><p class="hint">说明练习内容与观看方式，也可以补充自己的话。</p></div>
    <div class="sectionhead"><label for="publishDescription">视频简介 <small id="publishDescriptionCount"></small></label><button data-generate-publication="description" class="quiet">AI 生成简介</button></div><textarea id="publishDescription" rows="8" placeholder="这次会遇到哪些真实英语表达？观众可以怎样跟着练？"></textarea><div class="row"><button id="copyPublishDescription">复制简介</button></div>
  </section>
  <section id="publishPanel-tags" class="publish-copy hidden" data-publish-panel="tags" role="tabpanel" aria-labelledby="publishTab-tags">
    <div class="publish-panel-intro"><h3>选择相关标签</h3><p class="hint">用 #、逗号或换行分隔，最多 10 个，每个最多 20 字。</p></div>
    <div class="sectionhead"><label for="publishTags">发布标签 <small id="publishTagsCount"></small></label><button data-generate-publication="tags" class="quiet">AI 生成标签</button></div><textarea id="publishTags" rows="4" placeholder="#英语口语 #真实表达 #口语练习"></textarea><div class="row"><button id="copyPublishTags">复制标签</button></div>
  </section>
  <section id="publishPanel-reference" class="publish-copy hidden" data-publish-panel="reference" role="tabpanel" aria-labelledby="publishTab-reference">
    <div class="publish-panel-intro"><h3>视频与来源参考</h3><p class="hint">AI 仅在点击时使用选段文字与参考信息，不上传视频。</p></div>
    <div class="publish-video-row"><div><select id="publishVersion" aria-label="预览成片版本"></select><video id="publishVideo" controls preload="none" aria-label="当前成片"></video></div><p id="publishSnapshot" class="hint"></p></div>
    <details class="publish-reference" open><summary>YouTube 来源与内容参考（可选）</summary><p class="hint">优先依据这条成片的选段生成；原视频标题和简介只作参考。本地视频也可手动填写内容说明。</p><label class="label" for="publishSourceURL">YouTube 链接</label><div class="row wrap"><input id="publishSourceURL" class="grow" placeholder="https://www.youtube.com/watch?v=…"><button id="readPublishSource">读取原标题与简介</button></div><label class="label" for="publishSourceTitle">原标题</label><input id="publishSourceTitle" class="wide"><label class="label" for="publishSourceDescription">原简介 / 手动内容说明</label><textarea id="publishSourceDescription" rows="4"></textarea></details>
    <div class="publish-bundle-tools"><h3>整套文案</h3><p class="hint">为当前平台生成或复制完整文案，生成后可在各标签页检查。</p><div class="row wrap"><button id="generateAllPublication">AI 生成整套文案</button><button id="copyPublication">复制当前平台文案</button><button id="downloadPublishText">导出全部平台文案 TXT</button></div></div>
  </section>
</div>`;

const tipSetting = document.createElement('div');
tipSetting.className = 'card-tip-setting';
tipSetting.innerHTML = '<label for="cardTip">题卡提示语 <small id="cardTipCount">0 / 24</small></label><input id="cardTip" placeholder="试试用英文讲出来吧"><small class="muted">留空使用默认提示语，最多 24 字。</small>';
$('composeControls').after(tipSetting);

const publishLimits = {bilibili:{title:80,description:2000},douyin:{title:30,description:1000},xiaohongshu:{title:20,description:1000},other:{title:60,description:2000}};
const coverSizes = {landscape:[1920,1080],portrait:[1080,1920],portrait34:[1080,1440]};
const coverFiles = {landscape:'封面_横版.png',portrait:'封面_竖版.png',portrait34:'封面_3比4.png'};
const coverPresets = {
  viewfinder:{text_color:'#ffffff',accent:'#a8dfbd'},magazine:{text_color:'#fff5df',accent:'#e9a067'},
  note:{text_color:'#232b30',accent:'#ffe5a0'},pop:{text_color:'#ffffff',accent:'#fa6e9d'},minimal:{text_color:'#ffffff',accent:'#ffffff'},
};
const coverInputs = {title:'coverTitle',subtitle:'coverSubtitle',badge:'coverBadge',crop_x:'coverCropX',crop_y:'coverCropY',zoom:'coverZoom',text_x:'coverTextX',text_y:'coverTextY',font_scale:'coverFontScale',text_color:'coverTextColor',accent:'coverAccent',show_title:'coverShowTitle',show_subtitle:'coverShowSubtitle',show_badge:'coverShowBadge',show_frame:'coverShowFrame',show_panel:'coverShowPanel',show_gradient:'coverShowGradient',shadow:'coverShadow'};
let publishingOutput=null,publishingDraft=null,publishingDirty=false,publishingPid=null,publishingFrame=null,coverImages={},coverLayoutValid=true;

function characterCount(text){return Array.from(text).length}
function showCount(id,text,limit){$(id).textContent=characterCount(text)+' / '+limit;$(id).classList.toggle('count-error',characterCount(text)>limit)}
function updateCardTipCount(){showCount('cardTipCount',$('cardTip').value,24)}
$('cardTip').oninput=updateCardTipCount;
$('cardTip').onchange=()=>action(async()=>{if(project){await save();status('题卡提示语已保存，将用于之后的预览和导出。')}});

function publishURL(path,output,name=''){
  const q=new URLSearchParams({id:project.id,output,token});if(name)q.set('name',name);return path+'?'+q;
}
function markPublishingDirty(){publishingDirty=true;$('publishSaved').textContent='有未保存修改'}
function mayDiscardPublishing(){
  if(!publishingDirty)return true;
  return confirm('这条成片的发布资料尚未保存，是否放弃修改？');
}
function closePublishEditor(){
  publishingOutput=null;publishingDraft=null;publishingFrame=null;coverImages={};publishingDirty=false;
  for(const id of ['publishVideo','coverSourceVideo']){$(id).pause();$(id).removeAttribute('src');$(id).load()}
  $('publishEditor').classList.add('hidden');$('publishBack').classList.add('hidden');$('publishList').classList.remove('hidden');
}
function showPublishingPage(){
  if(isAndroid){showMobilePage('publish')}else{
    $('productionPage').classList.add('hidden');$('publishSection').classList.remove('hidden');
    $('publishingTab').classList.add('primary');$('productionTab').classList.remove('primary');
    $('video').pause();$('outputVideo').pause();window.scrollTo(0,0);
  }
  renderPublishList();
}
$('publishingTab').onclick=showPublishingPage;
$('productionTab').onclick=()=>{
  $('productionPage').classList.remove('hidden');$('publishSection').classList.add('hidden');
  $('productionTab').classList.add('primary');$('publishingTab').classList.remove('primary');
  $('publishVideo').pause();$('coverSourceVideo').pause();
};
$('publishBack').onclick=()=>{if(!mayDiscardPublishing())return;closePublishEditor();renderPublishList()};

function selectPublishTab(name, scrollToEditor=false){
  const panel=$('publishPanel-'+name);
  if(!panel)return;
  document.querySelectorAll('[data-publish-panel]').forEach(item=>item.classList.toggle('hidden',item!==panel));
  document.querySelectorAll('[data-publish-tab]').forEach(button=>{
    const selected=button.dataset.publishTab===name;
    button.setAttribute('aria-selected',String(selected));
    button.tabIndex=selected?0:-1;
  });
  if(name!=='cover')$('coverSourceVideo').pause();
  if(name!=='reference')$('publishVideo').pause();
  if(scrollToEditor)$('publishEditor').scrollIntoView({block:'start'});
}
const publishTabButtons=[...document.querySelectorAll('[data-publish-tab]')];
publishTabButtons.forEach((button,index)=>{
  button.onclick=()=>selectPublishTab(button.dataset.publishTab,true);
  button.onkeydown=event=>{
    let next;
    if(event.key==='ArrowRight')next=(index+1)%publishTabButtons.length;
    else if(event.key==='ArrowLeft')next=(index+publishTabButtons.length-1)%publishTabButtons.length;
    else if(event.key==='Home')next=0;
    else if(event.key==='End')next=publishTabButtons.length-1;
    else return;
    event.preventDefault();
    selectPublishTab(publishTabButtons[next].dataset.publishTab,true);
    publishTabButtons[next].focus({preventScroll:true});
  };
});

function renderPublishList(){
  if(publishingPid!==project?.id){closePublishEditor();publishingPid=project?.id}
  const items=project?.outputs||[];
  $('publishList').innerHTML=items.length?items.map(o=>{
    const p=o.publication||{},fields=p.platforms?.[p.platform]||{},ratio=p.ratio||'landscape';
    const image=(p.images||[]).includes(ratio)?`<img src="${escapeHTML(publishURL('/publish-asset',o.id,coverFiles[ratio]))}&v=${p.updated||0}" alt="这条成片的封面">`:'';
    return `<article class="publish-card"><video controls preload="none" src="${escapeHTML(publishURL('/output-media',o.id))}" aria-label="${escapeHTML(o.created||o.id)} 成片"></video>${image}<strong>${escapeHTML(fields.title||o.source_title||project.title)}</strong><small>${escapeHTML(o.created||'')} · ${escapeHTML(o.id)}<br>${escapeHTML(o.name)} · ${escapeHTML(o.count)} 段 · ${escapeHTML(o.seconds)} 秒</small><p>${escapeHTML(fields.description||'还没有发布文案。')}</p><p class="tags">${escapeHTML((fields.tags||[]).map(t=>'#'+t).join(' '))}</p><div class="row wrap"><button data-edit-publication="${escapeHTML(o.id)}" class="primary">编辑封面与文案</button>${isAndroid?`<button data-publish-save-video="${escapeHTML(o.id)}" data-video-name="${escapeHTML(o.name)}">保存视频</button>`:''}</div></article>`;
  }).join(''):'<p class="muted">先选择素材并合成视频，每条成片会在这里有自己的发布卡片。</p>';
}
$('publishList').onclick=e=>{
  const edit=e.target.closest('[data-edit-publication]'),save=e.target.closest('[data-publish-save-video]');
  if(edit)openPublishOutput(edit.dataset.editPublication);
  if(save&&isAndroid)window.AndroidHost.saveVideo(save.dataset.publishSaveVideo,save.dataset.videoName);
};
function defaultCover(output){return {style:'viewfinder',title:'这句话英语怎么说？',subtitle:'先试着说，再听真实表达',badge:'真实口语',frame_time:output.clips?.[0]?.start||0,crop_x:50,crop_y:50,zoom:1,text_x:0,text_y:72,font_scale:1,...coverPresets.viewfinder,show_title:true,show_subtitle:true,show_badge:true,show_frame:true,show_panel:false,show_gradient:true,shadow:true}}
function activeCover(){return publishingDraft.covers[publishingDraft.ratio]}
function loadCoverControls(){
  const cover=activeCover();
  for(const [key,id] of Object.entries(coverInputs)){if($(id).type==='checkbox')$(id).checked=Boolean(cover[key]);else $(id).value=cover[key]}
  document.querySelectorAll('[data-cover-style]').forEach(b=>{b.classList.toggle('active',b.dataset.coverStyle===cover.style);b.setAttribute('aria-pressed',String(b.dataset.coverStyle===cover.style))});
  $('coverFrameTime').value=Number(cover.frame_time).toFixed(2);updatePublishCounts();drawCover();
}
function loadPlatformControls(){
  const fields=publishingDraft.platforms[publishingDraft.platform]||{title:'',description:'',tags:[]};
  $('publishTitle').value=fields.title;$('publishDescription').value=fields.description;$('publishTags').value=fields.tags.map(t=>'#'+t).join(' ');updatePublishCounts();
}
function parsePublishTags(){return [...new Set($('publishTags').value.split(/[#，,\n]+/).map(t=>t.trim()).filter(Boolean))]}
function collectPublication(){
  publishingDraft.platforms[publishingDraft.platform]={title:$('publishTitle').value.trim(),description:$('publishDescription').value.trim(),tags:parsePublishTags()};
  publishingDraft.source={url:$('publishSourceURL').value.trim(),title:$('publishSourceTitle').value.trim(),description:$('publishSourceDescription').value.trim()};
}
async function openPublishOutput(id){
  if(busy||!project||!mayDiscardPublishing())return;
  const output=(project.outputs||[]).find(o=>o.id===id);if(!output)return;
  closePublishEditor();showPublishingPage();
  publishingOutput=output;publishingPid=project.id;
  publishingDraft=JSON.parse(JSON.stringify(output.publication||{platforms:{},covers:{},source:{url:output.source_url??project.url??'',title:output.source_title??project.title??'',description:output.source_description??project.description??''}}));
  publishingDraft.platform=publishingDraft.platform||'bilibili';publishingDraft.ratio=publishingDraft.ratio||(output.portrait?'portrait':'landscape');
  publishingDraft.covers[publishingDraft.ratio] ||= defaultCover(output);
  $('publishList').classList.add('hidden');$('publishEditor').classList.remove('hidden');$('publishBack').classList.remove('hidden');
  $('publishName').textContent=output.source_title||project.title;$('publishName').title=$('publishName').textContent;
  $('publishIdentity').textContent=(output.created||'')+' · 编号 '+output.id.slice(-6)+' · '+output.name;
  $('publishIdentity').title=output.id+' · '+output.name;
  $('publishSnapshot').textContent=output.clips?.length?'这条成片已保存 '+output.clips.length+' 段内容快照，AI 参考的是这条视频的选段。':'这是旧成片，没有选段快照。选帧使用成片本身（可能含题卡）；请在参考信息里填写实际内容后再用 AI。';
  $('publishVideo').src=publishURL('/output-media',output.id);$('coverSourceVideo').src=publishURL('/publish-source',output.id);
  $('publishVersion').innerHTML=(output.files?.length?output.files:[{name:output.name,label:'成片'}]).map(file=>`<option value="${escapeHTML(file.name)}">${escapeHTML(file.label)}</option>`).join('');
  $('coverFrameMode').value='manual';$('manualFrameControls').classList.remove('hidden');$('randomCoverFrame').classList.add('hidden');
  $('manualFrameControls').open=false;$('coverAdjustments').open=false;
  $('coverFrameHint').textContent='选择画面后，可继续修改裁切、文字和装饰。';
  $('publishPlatform').value=publishingDraft.platform;$('coverRatio').value=publishingDraft.ratio;
  $('publishSourceURL').value=publishingDraft.source.url;$('publishSourceTitle').value=publishingDraft.source.title;$('publishSourceDescription').value=publishingDraft.source.description;
  $('publishSaved').textContent=output.publication?'已加载这条成片的发布资料':'尚未保存发布资料';
  loadPlatformControls();loadCoverControls();
  selectPublishTab('cover');
  await action(()=>fetchCoverFrame('manual',activeCover().frame_time,false));
}

function updatePublishCounts(){
  if(!publishingDraft)return;
  const limit=publishLimits[publishingDraft.platform];
  for(const [input,count,max] of [['publishTitle','publishTitleCount',limit.title],['publishDescription','publishDescriptionCount',limit.description],['coverTitle','coverTitleCount',32],['coverSubtitle','coverSubtitleCount',40],['coverBadge','coverBadgeCount',12]])showCount(count,$(input).value,max);
  const tags=parsePublishTags();$('publishTagsCount').textContent=tags.length+' / 10';$('publishTagsCount').classList.toggle('count-error',tags.length>10||tags.some(t=>characterCount(t)>20));
}

async function fetchCoverFrame(mode,time,dirty=true){
  const response=await fetch('/api/publish-frame',{method:'POST',headers:{'X-App-Token':token,'Content-Type':'application/json'},body:JSON.stringify({id:project.id,output:publishingOutput.id,mode,time})});
  if(!response.ok){const error=await response.json();throw Error(error.error||'截取画面失败')}
  const url=URL.createObjectURL(await response.blob());
  try{const image=new Image();image.src=url;await image.decode();publishingFrame=image;activeCover().frame_time=Number(response.headers.get('X-Frame-Time'));$('coverFrameTime').value=activeCover().frame_time.toFixed(2);$('coverSourceVideo').currentTime=activeCover().frame_time;drawCover();if(dirty)markPublishingDirty();$('coverFrameHint').textContent='当前封面帧：'+fmt(activeCover().frame_time)+'。文字与装饰均可继续修改。'}finally{URL.revokeObjectURL(url)}
}

$('coverSourceVideo').ontimeupdate=()=>{if(document.activeElement!==$('coverFrameTime'))$('coverFrameTime').value=$('coverSourceVideo').currentTime.toFixed(2)};
$('publishVersion').onchange=()=>{$('publishVideo').src=publishURL('/output-media',publishingOutput.id)+'&file='+encodeURIComponent($('publishVersion').value)};
$('coverSourceVideo').onloadedmetadata=()=>{if(publishingDraft)$('coverSourceVideo').currentTime=activeCover().frame_time};
$('coverFrameTime').onchange=()=>{const time=Number($('coverFrameTime').value);if(Number.isFinite(time)&&time>=0)$('coverSourceVideo').currentTime=time};
$('coverFrameMode').onchange=()=>{const random=$('coverFrameMode').value==='random';$('manualFrameControls').classList.toggle('hidden',random);$('manualFrameControls').open=!random;$('randomCoverFrame').classList.toggle('hidden',!random);$('coverSourceVideo').pause();if(random)action(()=>fetchCoverFrame('random',0))};
$('captureCoverFrame').onclick=()=>action(()=>fetchCoverFrame('manual',Number($('coverFrameTime').value)));
$('randomCoverFrame').onclick=()=>action(()=>fetchCoverFrame('random',0));

function cacheCoverImage(){
  if(!publishingFrame)return;
  if(!coverLayoutValid){selectPublishTab('cover',true);throw Error('封面文字放不下，请缩短文字或减小字号')}
  coverImages[publishingDraft.ratio]=$('coverCanvas').toDataURL('image/png').split(',')[1];
}
$('coverRatio').onchange=()=>action(async()=>{
  const oldRatio=publishingDraft.ratio,newRatio=$('coverRatio').value;
  try{cacheCoverImage()}catch(error){$('coverRatio').value=oldRatio;throw error}
  publishingDraft.ratio=newRatio;
  publishingDraft.covers[newRatio] ||= JSON.parse(JSON.stringify(activeCoverForRatio(oldRatio)));
  loadCoverControls();markPublishingDirty();
  if(!publishingFrame||activeCover().frame_time!==activeCoverForRatio(oldRatio).frame_time){publishingFrame=null;drawCover();await fetchCoverFrame('manual',activeCover().frame_time,false)}
});
function activeCoverForRatio(ratio){return publishingDraft.covers[ratio]}
$('publishPlatform').onchange=()=>{collectPublication();publishingDraft.platform=$('publishPlatform').value;loadPlatformControls();markPublishingDirty()};
for(const [key,id] of Object.entries(coverInputs))$(id).oninput=()=>{if(!publishingDraft)return;activeCover()[key]=$(id).type==='checkbox'?$(id).checked:$(id).type==='range'?Number($(id).value):$(id).value;markPublishingDirty();updatePublishCounts();drawCover()};
document.querySelectorAll('[data-cover-style]').forEach(button=>button.onclick=()=>{const style=button.dataset.coverStyle;Object.assign(activeCover(),{style,...coverPresets[style],show_panel:['magazine','note','pop'].includes(style),shadow:style!=='note'});loadCoverControls();markPublishingDirty()});
for(const id of ['publishTitle','publishDescription','publishTags','publishSourceURL','publishSourceTitle','publishSourceDescription'])$(id).oninput=()=>{markPublishingDirty();updatePublishCounts()};

function validatePublicationDraft(){
  collectPublication();
  for(const [platform,fields] of Object.entries(publishingDraft.platforms)){
    const limit=publishLimits[platform];
    let field,message;
    if(characterCount(fields.title)>limit.title){field='title';message='标题超出字数限制，最多 '+limit.title+' 字，请缩短后保存'}
    else if(characterCount(fields.description)>limit.description){field='description';message='简介超出字数限制，最多 '+limit.description+' 字，请缩短后保存'}
    else if(fields.tags.length>10||fields.tags.some(t=>characterCount(t)>20)){field='tags';message='标签最多 10 个，每个最多 20 字'}
    if(field){
      publishingDraft.platform=platform;$('publishPlatform').value=platform;loadPlatformControls();
      selectPublishTab(field,true);throw Error(message);
    }
  }
  for(const cover of Object.values(publishingDraft.covers))if(characterCount(cover.title)>32||characterCount(cover.subtitle)>40||characterCount(cover.badge)>12){selectPublishTab('cover',true);throw Error('封面文案超过字数限制，请缩短')}
}
async function persistPublication(){
  validatePublicationDraft();cacheCoverImage();
  const output=await api('/api/publish-save',{id:project.id,output:publishingOutput.id,publication:publishingDraft,cover_images:coverImages,ratio:publishingDraft.ratio});
  const index=project.outputs.findIndex(o=>o.id===output.id);project.outputs[index]=output;publishingOutput=output;publishingDraft=JSON.parse(JSON.stringify(output.publication));coverImages={};publishingDirty=false;
  $('publishSaved').textContent='这条成片的资料已保存';renderPublishList();return output;
}
$('savePublication').onclick=()=>action(async()=>{await persistPublication();status('封面与各平台文案已保存在这条成片的目录。')});
function downloadPublishAsset(name){
  if(isAndroid){if(typeof window.AndroidHost.savePublicationFile!=='function')throw Error('请更新安卓版以保存封面和文案');window.AndroidHost.savePublicationFile(publishingOutput.id,name);return}
  const link=document.createElement('a');link.href=publishURL('/publish-asset',publishingOutput.id,name);link.download=publishingOutput.id+'_'+name;link.click();
}
$('downloadCover').onclick=()=>action(async()=>{if(!publishingFrame)throw Error('请先选择一帧画面');await persistPublication();downloadPublishAsset(coverFiles[publishingDraft.ratio])});
$('downloadPublishText').onclick=()=>action(async()=>{await persistPublication();downloadPublishAsset('发布文案.txt')});
$('downloadPublication').onclick=()=>action(async()=>{
  const output=await persistPublication();
  if(isAndroid){const r=await api('/api/publish-folder',{id:project.id,output:output.id});window.AndroidHost.saveBatch(r.folder)}
  else{await job('/api/publish-package',{id:project.id,output:output.id});downloadPublishAsset('发布包.zip')}
});
async function copyPublishingText(text,message){
  if(!text.trim())throw Error('请先填写要复制的文案');
  try{await navigator.clipboard.writeText(text);status(message)}
  catch(error){status('当前设备无法自动复制，请直接选择输入框中的文字复制。',true)}
}
$('copyPublishTitle').onclick=()=>action(()=>copyPublishingText($('publishTitle').value,'标题已复制。'));
$('copyPublishDescription').onclick=()=>action(()=>copyPublishingText($('publishDescription').value,'简介已复制。'));
$('copyPublishTags').onclick=()=>action(()=>copyPublishingText(parsePublishTags().map(tag=>'#'+tag).join(' '),'标签已复制。'));
$('copyPublication').onclick=()=>action(async()=>{collectPublication();const f=publishingDraft.platforms[publishingDraft.platform];await copyPublishingText(f.title+'\n\n'+f.description+'\n\n'+f.tags.map(t=>'#'+t).join(' '),'已复制当前平台文案。')});

async function generatePublication(field){
  collectPublication();
  const fields=publishingDraft.platforms[publishingDraft.platform],cover=activeCover();
  const hasText=field==='cover'?[cover.title,cover.subtitle,cover.badge].some(Boolean):field==='all'?[fields.title,fields.description,fields.tags.length,cover.title,cover.subtitle].some(Boolean):field==='tags'?fields.tags.length:Boolean(fields[field]);
  if(hasText&&!confirm('AI 生成会替换对应文案，其他内容保留。是否继续？'))return;
  const response=await job('/api/publish-generate',{id:project.id,output:publishingOutput.id,platform:publishingDraft.platform,field,source:publishingDraft.source});
  for(const key of ['title','description','tags'])if(key in response.fields)fields[key]=response.fields[key];
  for(const [key,name] of [['title','cover_title'],['subtitle','cover_subtitle'],['badge','cover_badge']])if(name in response.fields)cover[key]=response.fields[name];
  loadPlatformControls();loadCoverControls();markPublishingDirty();status('AI 文案已生成，请检查后保存。'+(response.usage?.total_tokens?' 本次 '+response.usage.total_tokens+' Token。':''));
}
document.querySelectorAll('[data-generate-publication]').forEach(button=>button.onclick=()=>action(()=>generatePublication(button.dataset.generatePublication)));
$('generateCoverText').onclick=()=>action(()=>generatePublication('cover'));
$('generateAllPublication').onclick=()=>action(()=>generatePublication('all'));
$('readPublishSource').onclick=()=>action(async()=>{
  if(($('publishSourceTitle').value||$('publishSourceDescription').value)&&!confirm('读取来源会替换参考标题和简介，是否继续？'))return;
  const source=await job('/api/publish-source',{url:$('publishSourceURL').value.trim()});
  $('publishSourceTitle').value=source.title;$('publishSourceDescription').value=source.description;collectPublication();markPublishingDirty();status('已读取来源信息，生成时优先使用这条成片的选段内容。');
});
window.addEventListener('beforeunload',event=>{if(publishingDirty){event.preventDefault();event.returnValue=''}});
// 同时只播放一个预览，避免批量卡片的声音叠加。
document.addEventListener('play',event=>{if(event.target instanceof HTMLVideoElement)document.querySelectorAll('video').forEach(video=>{if(video!==event.target)video.pause()})},true);

function wrapCoverText(context,text,width){
  const lines=[];for(const paragraph of text.split('\n')){let line='';for(const char of Array.from(paragraph)){if(line&&context.measureText(line+char).width>width){lines.push(line);line=char}else line+=char}lines.push(line)}return lines;
}

function drawCover(){
  if(!publishingDraft)return;
  const cover=activeCover(),canvas=$('coverCanvas'),[width,height]=coverSizes[publishingDraft.ratio];
  canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');
  ctx.fillStyle='#19222e';ctx.fillRect(0,0,width,height);
  if(publishingFrame){const scale=Math.max(width/publishingFrame.width,height/publishingFrame.height)*cover.zoom,sw=width/scale,sh=height/scale;ctx.drawImage(publishingFrame,(publishingFrame.width-sw)*cover.crop_x/100,(publishingFrame.height-sh)*cover.crop_y/100,sw,sh,0,0,width,height)}
  if(cover.show_gradient){const gradient=ctx.createLinearGradient(0,0,0,height);gradient.addColorStop(0,'rgba(0,0,0,0.05)');gradient.addColorStop(1,'rgba(0,0,0,0.75)');ctx.fillStyle=gradient;ctx.fillRect(0,0,width,height)}
  const margin=width*.06,boxWidth=width*.78;
  let fontSize=(width>height?108:96)*cover.font_scale,titleLines=[],subtitleLines=[];
  do{ctx.font=`700 ${fontSize}px "Microsoft YaHei",sans-serif`;titleLines=cover.show_title&&cover.title?wrapCoverText(ctx,cover.title,boxWidth):[];if(titleLines.length<=2)break;fontSize-=2}while(fontSize>=40);
  const subtitleSize=Math.round(fontSize*.42);ctx.font=`${subtitleSize}px "Microsoft YaHei",sans-serif`;
  subtitleLines=cover.show_subtitle&&cover.subtitle?wrapCoverText(ctx,cover.subtitle,boxWidth):[];
  coverLayoutValid=titleLines.length<=2&&subtitleLines.length<=2&&characterCount(cover.title)<=32&&characterCount(cover.subtitle)<=40&&characterCount(cover.badge)<=12;
  const titleHeight=titleLines.length*fontSize*1.27,subtitleHeight=subtitleLines.length*(subtitleSize*1.5),gap=titleLines.length&&subtitleLines.length?fontSize*.3:0;
  const groupHeight=titleHeight+subtitleHeight+gap,x=margin+(width-2*margin-boxWidth)*cover.text_x/100,y=margin+(height-2*margin-groupHeight)*cover.text_y/100;
  if(cover.show_panel&&groupHeight){ctx.fillStyle=cover.style==='note'?cover.accent:cover.style==='magazine'?'rgba(15,23,30,0.83)':cover.style==='pop'?cover.accent:'rgba(10,20,25,0.68)';ctx.fillRect(x-24,y-20,boxWidth+48,groupHeight+40)}
  if(cover.show_frame){
    ctx.strokeStyle=cover.accent;ctx.lineWidth=width*.005;ctx.fillStyle=cover.accent;
    if(cover.style==='viewfinder'){
      const m=margin*.55,length=width*.075;ctx.beginPath();for(const [cx,cy,dx,dy] of [[m,m,1,1],[width-m,m,-1,1],[m,height-m,1,-1],[width-m,height-m,-1,-1]]){ctx.moveTo(cx+dx*length,cy);ctx.lineTo(cx,cy);ctx.lineTo(cx,cy+dy*length)}ctx.stroke();
    }else if(cover.style==='magazine'){ctx.fillRect(margin,margin,width*.15,8);ctx.fillRect(width-margin-8,height*.3,8,height*.18)}
    else if(cover.style==='note'){ctx.save();ctx.translate(width*.84,margin);ctx.rotate(.14);ctx.globalAlpha=.85;ctx.fillRect(-width*.07,0,width*.14,36);ctx.restore()}
    else if(cover.style==='pop'){ctx.beginPath();ctx.moveTo(width,0);ctx.lineTo(width-width*.2,0);ctx.lineTo(width,height*.14);ctx.closePath();ctx.fill();ctx.fillRect(margin,height-margin-14,width*.18,14)}
    else{ctx.fillRect(margin,margin,60,5);ctx.fillRect(width-margin-60,height-margin-5,60,5)}
  }
  ctx.textBaseline='top';
  if(cover.show_badge&&cover.badge){const badgeSize=width>height?30:28;ctx.font=`600 ${badgeSize}px "Microsoft YaHei",sans-serif`;const bw=ctx.measureText(cover.badge).width+36;ctx.fillStyle=cover.accent;ctx.fillRect(margin,margin+25,bw,badgeSize+24);ctx.fillStyle='#18232a';ctx.fillText(cover.badge,margin+18,margin+37)}
  if(cover.shadow){ctx.shadowColor='rgba(0,0,0,0.75)';ctx.shadowBlur=8;ctx.shadowOffsetY=3}
  ctx.fillStyle=cover.text_color;ctx.font=`700 ${fontSize}px "Microsoft YaHei",sans-serif`;titleLines.forEach((line,i)=>ctx.fillText(line,x,y+i*fontSize*1.27));
  ctx.font=`${subtitleSize}px "Microsoft YaHei",sans-serif`;subtitleLines.forEach((line,i)=>ctx.fillText(line,x,y+titleHeight+gap+i*subtitleSize*1.5));
  $('coverLayoutHint').textContent=!coverLayoutValid?'文字放不下：主文案最多两行、副文案最多两行，请缩短文案或减小字号。':publishingFrame?`${width} × ${height} · 预览与保存使用同一张画布。`:'先手动选帧，或选择自动随机选帧。';
  $('coverLayoutHint').classList.toggle('error',!coverLayoutValid);
}

renderPublishList();
