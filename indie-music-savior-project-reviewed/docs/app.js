import { API_BASE } from './config.js';
import { fallbackWriting } from './cover-preview.mjs';
const byId=id=>document.getElementById(id);
const apiBase=String(API_BASE||'').replace(/\/+$/,'');
const state={songs:[],lastAction:'mood',previousId:null,working:false,aiAvailable:false,llmAvailable:false,imageAvailable:false,lastResult:null,coverWorking:false,cooldownUntil:0,coverCooldownUntil:0,textRouteUntil:0,randomBag:[]};
const covers=new Map(), textCache=new Map(), reviewCache=new Map();
const feedback=(message='',isError=false)=>{const el=byId('feedback');el.textContent=message;el.classList.toggle('error',isError);};
const tag=(text,klass='tag')=>{const el=document.createElement('span');el.className=klass;el.textContent=text;return el;};
function drawTags(p){
  const nodes=[];
  for(const [label,key] of [['情緒','moods'],['曲風','genres'],['情境','scenes'],['樂器','instruments']]){
    for(const value of p[key]||[]){const node=tag('','analysis-tag'),name=document.createElement('span');name.textContent=label;node.append(name,document.createTextNode(value));nodes.push(node);}
  }
  if(p.energy&&p.energy!=='any')nodes.push(tag(`能量 · ${p.energy}`,'analysis-tag'));
  if(!nodes.length)nodes.push(tag('探索歌曲庫','analysis-tag'));
  byId('analysis-tags').replaceChildren(...nodes);
}
const coverKey=data=>`${data.song.id}|${data.imagePrompt}`;
function remember(map,key,value,max){map.delete(key);map.set(key,value);if(map.size>max)map.delete(map.keys().next().value);}
function secondsLeft(until){return Math.max(0,Math.ceil((until-Date.now())/1000));}
function syncButtons(){
  const busy=state.working||state.coverWorking, ready=!!state.songs.length;
  const textWait=secondsLeft(Math.max(state.textRouteUntil,state.cooldownUntil));
  const coverWait=secondsLeft(state.coverCooldownUntil);
  byId('random-btn').disabled=busy||!ready;
  byId('recommend-btn').disabled=busy||!ready||!state.aiAvailable||secondsLeft(state.textRouteUntil)>0;
  byId('again-btn').disabled=busy||!ready||(state.lastAction!=='random'&&(!state.aiAvailable||secondsLeft(state.textRouteUntil)>0));
  const review=byId('review-btn');review.hidden=!state.lastResult||state.lastResult.textSource==='llm';
  review.disabled=busy||!state.aiAvailable||!state.llmAvailable||textWait>0;
  review.textContent=state.working?'✦ 生成 AI 樂評':textWait?`✦ 樂評（${textWait} 秒）`:'✦ 生成 AI 樂評';
  const cover=byId('generate-cover');cover.disabled=busy||!state.imageAvailable||!state.lastResult||coverWait>0;
  if(!state.coverWorking)cover.textContent=coverWait?`封面創作（${coverWait} 秒）`:byId('cover').classList.contains('has-ai-image')?'↻ 重新生成封面':'✦ 生成專屬封面';
  if(!coverWait&&byId('cover-image-status').dataset.cooldown==='1'){
    byId('cover-image-status').textContent='';delete byId('cover-image-status').dataset.cooldown;
  }
  if(!secondsLeft(state.textRouteUntil)&&byId('feedback').dataset.cooldown==='1'){
    feedback('');delete byId('feedback').dataset.cooldown;
  }
}
setInterval(syncButtons,1000);
function setCoverImage(dataURI){
  const image=byId('cover-ai-image');image.src=dataURI;image.hidden=false;
  byId('cover').classList.add('has-ai-image');
  const link=byId('download-cover');link.href=dataURI;link.hidden=false;
  link.download=`${String(state.lastResult.song.title).replace(/[\\/:*?"<>|]/g,'_').slice(0,80)}-AI-cover.jpg`;
  byId('cover-caption').hidden=false;
  byId('cover-image-status').textContent='封面創作完成';
  byId('generate-cover').textContent='↻ 重新生成封面';
}
function resetCover(){
  const image=byId('cover-ai-image');image.hidden=true;image.removeAttribute('src');
  byId('cover').classList.remove('has-ai-image');
  byId('download-cover').hidden=true;byId('download-cover').setAttribute('href','#');
  byId('cover-caption').hidden=true;
  byId('generate-cover').textContent='✦ 生成專屬封面';
  byId('cover-image-status').textContent=state.imageAvailable?'':'封面服務暫時無法使用。';delete byId('cover-image-status').dataset.cooldown;
}
function render(data){
  const s=data.song;
  state.lastResult=data;state.previousId=s.id;
  byId('song-name').textContent=s.title;byId('artist').textContent=s.artist;
  byId('tags').replaceChildren(...[...s.genre,...s.mood.slice(0,2)].map(x=>tag(x)));
  const generated=data.textSource==='llm';
  byId('review-heading').textContent=generated?'微型樂評':'歌曲簡介';
  byId('review-source').textContent=generated?'AI 生成':'資料庫';
  byId('score').textContent=data.matchScore==null?'隨機探索':`標籤相似度 ${data.matchScore}%`;
  byId('review-text').textContent=data.review;byId('reason-text').textContent=data.reason;
  byId('result-message').textContent=generated||data.textSource==='preview'?'':data.warning||'AI 樂評暫時無法生成，先為你提供歌曲簡介。';
  byId('prompt-text').textContent=data.imagePrompt;
  byId('analysis-explanation').textContent=data.analysis?.explanation||'';drawTags(data.analysis||{});
  for(let i=0;i<3;i++){
    const value=s.color_palette?.[i];
    if(/^#[a-f0-9]{6}$/i.test(value||''))byId('cover').style.setProperty(`--tone${i+1}`,value);
    else byId('cover').style.removeProperty(`--tone${i+1}`);
  }
  byId('youtube-link').href=`https://www.youtube.com/watch?v=${encodeURIComponent(s.youtube_id)}`;
  const iframe=document.createElement('iframe');iframe.title=`${s.artist} - ${s.title} YouTube 播放器`;
  iframe.src=`https://www.youtube-nocookie.com/embed/${encodeURIComponent(s.youtube_id)}?rel=0`;
  iframe.loading='lazy';iframe.referrerPolicy='strict-origin-when-cross-origin';
  iframe.setAttribute('allow','accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share');iframe.setAttribute('allowfullscreen','');
  byId('player').replaceChildren(iframe);byId('results').hidden=false;
  resetCover();const previous=covers.get(coverKey(data));if(previous)setCoverImage(previous);
  syncButtons();
  byId('results').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
}
function cacheKey(action,mood,previousId){return JSON.stringify([action,mood.toLowerCase(),previousId||'']);}
async function readJSON(response,message){
  let data;try{data=await response.json();}catch{data={};if(response.ok)throw new Error(message);}
  if(!response.ok){const error=new Error(data.error||message);error.status=response.status;error.retryAfter=Math.max(1,Math.ceil(Number(data.retryAfter||response.headers.get('Retry-After'))||60));throw error;}
  return data;
}
function drawRandom(){
  if(!state.randomBag.length){state.randomBag=state.songs.slice();for(let i=state.randomBag.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[state.randomBag[i],state.randomBag[j]]=[state.randomBag[j],state.randomBag[i]];}}
  if(state.randomBag.length>1&&state.randomBag.at(-1).id===state.previousId){const last=state.randomBag.length-1;[state.randomBag[0],state.randomBag[last]]=[state.randomBag[last],state.randomBag[0]];}
  const song=state.randomBag.pop();const analysis={moods:[],genres:[],scenes:[],instruments:[],energy:'any',explanation:'從歌曲庫隨機探索。'};
  const cached=reviewCache.get(song.id);
  state.lastAction='random';
  render(cached||{song,analysis,matchScore:null,...fallbackWriting(song,analysis),textSource:'preview',reason:'從獨立音樂歌單隨機選出這首歌。',visualAccent:''});feedback('');
}
function setTextCooldown(data){if(Number(data.retryAfter)>0)state.cooldownUntil=Date.now()+Math.ceil(Number(data.retryAfter))*1000;}
async function generateReview(){
  const data=state.lastResult;
  if(!data||state.working||state.coverWorking||!state.aiAvailable||!state.llmAvailable||secondsLeft(Math.max(state.textRouteUntil,state.cooldownUntil)))return;
  state.working=true;syncButtons();byId('result-message').textContent='正在創作樂評…';
  try{
    const response=await fetch(`${apiBase}/recommend`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'review',songId:data.song.id,mood:state.lastAction==='mood'?(data.listenerMood||''):'',useLLM:true})});
    const result=await readJSON(response,'樂評暫時無法生成。');setTextCooldown(result);
    if(result.song?.id!==data.song.id)throw new Error('歌曲資料不一致，請重新整理。');
    if(result.textSource!=='llm'){byId('result-message').textContent=result.warning||'樂評暫時無法生成。';return;}
    const updated={...data,...result,analysis:data.analysis,matchScore:data.matchScore,listenerMood:data.listenerMood,imagePrompt:data.imagePrompt,visualAccent:data.visualAccent};
    // 保留已生成的封面及正在播放的影片；只更新文字。
    state.lastResult=updated;
    byId('review-heading').textContent='微型樂評';byId('review-source').textContent='AI 生成';byId('review-text').textContent=updated.review;byId('reason-text').textContent=updated.reason;byId('result-message').textContent='';
    if(state.lastAction==='random')remember(reviewCache,updated.song.id,updated,32);
  }catch(e){if(e.status===429)state.textRouteUntil=Date.now()+e.retryAfter*1000;byId('result-message').textContent=e.status===429?'樂評暫時忙碌，稍後可再次創作。':e.message;}
  finally{state.working=false;syncButtons();}
}
async function run(action){
  if(state.working||state.coverWorking)return;
  if(action==='random'){if(state.songs.length)drawRandom();return;}
  if(!state.aiAvailable||secondsLeft(state.textRouteUntil))return;
  const mood=action==='random'?'':byId('mood-text').value.trim();
  if(action==='mood'&&!mood){feedback('先留下一段心情，或試試隨機抽歌。',true);byId('mood-text').focus();return;}
  if(!state.songs.length){feedback('歌曲資料暫時無法載入。',true);return;}
  const key=cacheKey(action,mood,state.previousId);
  // 成功的相同請求才會重用。遇到 429 暫停 Groq 請求，避免短時間重複撞限流；介面仍標示資料庫簡介。
  const useLLM=state.llmAvailable&&Date.now()>=state.cooldownUntil;
  state.working=true;state.lastAction=action;syncButtons();feedback('正在為你尋找一首歌…');
  try{
    let data=action==='mood'?textCache.get(key):null;
    if(!data){
      const response=await fetch(`${apiBase}/recommend`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:action,mood,previousId:state.previousId,useLLM})});
      data=await readJSON(response,'推薦服務暫時無法使用。');
      setTextCooldown(data);data.listenerMood=mood;
      if(action==='mood'&&data.textSource==='llm')remember(textCache,key,data,16);
    }
    render(data);feedback('');
  }catch(e){if(e.status===429){state.textRouteUntil=Date.now()+e.retryAfter*1000;feedback('心情推薦暫時忙碌，仍可隨機抽歌。',true);byId('feedback').dataset.cooldown='1';}else feedback(e?.message||'推薦失敗，請稍後再試。',true);}
  finally{state.working=false;syncButtons();}
}
// 對高彩度像素做溫和壓縮；保留原構圖與細節，下載與畫面使用同一張 JPEG。
function softenCover(image){
  const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('圖片處理暫時無法使用。');
  ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height),p=pixels.data;
  for(let i=0;i<p.length;i+=4){
    const r=p[i],g=p[i+1],b=p[i+2],lum=.2126*r+.7152*g+.0722*b;
    const chroma=Math.max(r,g,b)-Math.min(r,g,b);
    const sat=0.93-0.30*Math.max(0,(chroma-65)/190);
    for(let j=0;j<3;j++)p[i+j]=Math.round(128+0.95*(lum+(p[i+j]-lum)*sat-128));
  }
  ctx.putImageData(pixels,0,0);return canvas.toDataURL('image/jpeg',0.94);
}
async function generateCover(){
  const data=state.lastResult;
  if(!data||!state.imageAvailable||state.working||state.coverWorking||secondsLeft(state.coverCooldownUntil))return;
  const key=coverKey(data);
  state.coverWorking=true;syncButtons();byId('generate-cover').textContent='創作中…';byId('cover-image-status').textContent='正在將歌曲的氛圍轉化為封面…';
  try{
    const response=await fetch(`${apiBase}/cover`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({songId:data.song.id,preferences:data.analysis,visualAccent:data.visualAccent||''})});
    const payload=await readJSON(response,'圖片服務暫時無法使用。');
    if(typeof payload.dataURI!=='string'||!payload.dataURI.startsWith('data:image/jpeg;base64,')||payload.source!=='workers-ai')throw new Error('圖片內容格式異常，請再試一次。');
    // 確保回傳的是可解碼的影像，才顯示下載成功；不以 CSS 示意圖冒充 AI 封面。
    const probe=new Image();probe.src=payload.dataURI;await probe.decode();
    if(state.lastResult!==data)return;
    if(payload.imagePrompt)byId('prompt-text').textContent=payload.imagePrompt;
    const graded=softenCover(probe);
    remember(covers,key,graded,4);setCoverImage(graded);
  }catch(e){if(state.lastResult===data){if(e.status===429){state.coverCooldownUntil=Date.now()+e.retryAfter*1000;byId('cover-image-status').textContent='圖片服務暫時忙碌，可於倒數結束後再試。';byId('cover-image-status').dataset.cooldown='1';}else byId('cover-image-status').textContent=e?.message||'封面創作失敗，請稍後再試。';}}
  finally{state.coverWorking=false;syncButtons();}
}
async function init(){
  try{
    const r=await fetch('./data/songs.json',{cache:'no-store'});if(!r.ok)throw new Error();
    const songs=await r.json();if(!Array.isArray(songs)||!songs.length)throw new Error();state.songs=songs;byId('library-count').textContent=songs.length;
  }catch{feedback('歌曲資料暫時無法載入。',true);}
  try{
    if(!apiBase||!/^https:\/\/[^/]+$/.test(apiBase)||apiBase.includes('REPLACE'))throw new Error('尚未設定服務網址。');
    const r=await fetch(`${apiBase}/status`,{signal:AbortSignal.timeout(8000)});
    const data=await readJSON(r,'服務尚未就緒。');
    if(data.coverDesign!=='song-specific'||data.interaction!=='local-random-v1')throw new Error('網站服務尚未同步更新，請稍後重新整理。');
    state.aiAvailable=!!data.recommendReady;state.llmAvailable=!!data.llmReady;state.imageAvailable=!!data.imageReady;
    byId('connection-status').textContent=state.aiAvailable?'✦ 已連線':'△ 暫時無法使用';
    if(!state.aiAvailable)feedback('推薦服務暫時無法使用。',true);
  }catch(e){byId('connection-status').textContent='◌ 無法連線';feedback(e?.message||'無法連線，請稍後再試。',true);}
  finally{syncButtons();}
}
byId('recommend-btn').addEventListener('click',()=>run('mood'));
byId('random-btn').addEventListener('click',()=>run('random'));
byId('again-btn').addEventListener('click',()=>run(state.lastAction));
byId('generate-cover').addEventListener('click',generateCover);
byId('review-btn').addEventListener('click',generateReview);
byId('mood-text').addEventListener('input',()=>{byId('char-count').textContent=`${byId('mood-text').value.length} / 220`;});
for(const chip of document.querySelectorAll('[data-mood]'))chip.addEventListener('click',()=>{byId('mood-text').value=chip.dataset.mood;byId('mood-text').dispatchEvent(new Event('input'));feedback('');});
byId('copy-prompt').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(byId('prompt-text').textContent);byId('copy-prompt').textContent='✓ 已複製';}catch{byId('copy-prompt').textContent='請手動複製';}setTimeout(()=>{byId('copy-prompt').textContent='複製';},1800);});
init();
