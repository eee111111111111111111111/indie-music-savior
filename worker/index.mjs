import { SONGS } from '../shared/catalog.mjs';
import { writeReviewAndPrompt, AIError, providerConfig } from '../shared/openai.mjs';
import { cleanPreferences, localPreferences, selectSong } from '../shared/recommender.mjs';
import { fallbackWriting, prepareImagePrompt, visualAccent } from '../shared/visual.mjs';

function reply(payload, status=200, headers={}) {
  return Response.json(payload, {status, headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
}
function corsFor(origin,env){
  return origin && env.ALLOWED_ORIGIN && origin===env.ALLOWED_ORIGIN
    ? {'Access-Control-Allow-Origin':origin,'Vary':'Origin',
       'Access-Control-Allow-Methods':'GET, POST, OPTIONS',
       'Access-Control-Allow-Headers':'Content-Type'} : {};
}
function originAllowed(origin,env){return !!(origin && env.ALLOWED_ORIGIN && origin===env.ALLOWED_ORIGIN);}
async function parseBody(request,headers){
  if(!request.headers.get('content-type')?.startsWith('application/json'))
    return {error:reply({error:'請以 JSON 格式傳入資料。'},415,headers)};
  if(Number(request.headers.get('content-length')||0)>4096)
    return {error:reply({error:'請求過長。'},413,headers)};
  const raw=await request.text();
  if(raw.length>4096)return {error:reply({error:'請求過長。'},413,headers)};
  try{return {body:JSON.parse(raw)};}catch{return {error:reply({error:'JSON 格式錯誤。'},400,headers)};}
}
async function limitOrError(binding,key,headers){
  if(!binding)return reply({error:'缺少 Rate Limiter 綁定，請檢查 wrangler.jsonc。'},503,headers);
  try {
    const {success}=await binding.limit({key});
    if(!success)return reply({error:'操作太頻繁，請稍後再試。'},429,headers);
    return null;
  } catch {return reply({error:'請求保護服務暫時無法使用。'},503,headers);}
}
export default {
  async fetch(request,env){
    const path=new URL(request.url).pathname;
    const origin=request.headers.get('origin');
    const headers=corsFor(origin,env);
    if(request.method==='OPTIONS'){
      if(!originAllowed(origin,env))return reply({error:'Origin 不允許。'},403);
      return new Response(null,{status:204,headers:{...headers,'Access-Control-Max-Age':'600'}});
    }
    if(path==='/status' && request.method==='GET'){
      try {
        const config=providerConfig(env);
        return reply({ok:true,version:'3.1',coverDesign:'song-specific',provider:config.provider,model:config.model,
          configured:!!(config.key && env.ALLOWED_ORIGIN),
          recommendReady:!!(env.ALLOWED_ORIGIN && env.REQUEST_LIMITER),
          llmReady:!!(config.key && env.ALLOWED_ORIGIN),
          imageReady:!!(env.AI && env.COVER_LIMITER && env.ALLOWED_ORIGIN),
          imageModel:'@cf/black-forest-labs/flux-1-schnell'},200,headers);
      }catch(e){return reply({ok:false,error:e.message},503,headers);}
    }
    if(!['/recommend','/cover'].includes(path))return reply({error:'找不到 API 路徑。'},404,headers);
    if(request.method!=='POST')return reply({error:'請使用 POST。'},405,headers);
    if(!originAllowed(origin,env))return reply({error:'禁止來自其他網站的請求。'},403,headers);
    const parsed=await parseBody(request,headers);
    if(parsed.error)return parsed.error;
    const body=parsed.body;
    if(!body || typeof body!=='object'||Array.isArray(body))return reply({error:'資料格式錯誤。'},400,headers);
    const ip=request.headers.get('cf-connecting-ip')||'unknown';

    if(path==='/recommend'){
      const mode=body.mode==='random'?'random':'mood';
      const mood=typeof body.mood==='string'?body.mood.trim():'';
      if(mood.length>220||(mode==='mood'&&!mood))return reply({error:'心情描述限 1～220 字。'},400,headers);
      const wantLLM=body.useLLM!==false;
      const previousId=typeof body.previousId==='string'?body.previousId.slice(0,25):null;
      const limited=await limitOrError(env.REQUEST_LIMITER,`recommend:${ip}`,headers);
      if(limited)return limited;
      const prefs=cleanPreferences(mode==='mood'?localPreferences(mood):{});
      const picked=selectSong(SONGS,prefs,previousId,mode);
      let writing=fallbackWriting(picked.song,prefs);
      let textSource='rules';
      let warning='';
      let accent='';
      let retryAfter=0;
      if(wantLLM){
        try {
          const provider=providerConfig(env);
          if(!provider.key) throw new AIError(`尚未設定 ${provider.keyName}。`,503);
          const generated=await writeReviewAndPrompt({text:mood||'隨機抽歌，請根據選中歌曲的已知標籤寫作。',song:picked.song,preferences:prefs},env);
          if (![generated.review,generated.reason,generated.imagePrompt].every(x=>typeof x==='string'&&x.trim()))
            throw new AIError('LLM 回應不完整。');
          accent=visualAccent(generated.imagePrompt);
          writing={review:generated.review,reason:generated.reason,imagePrompt:prepareImagePrompt(picked.song,prefs,accent)};
          textSource='llm';
        }catch(e){
          textSource='fallback';
          if(e instanceof AIError && e.status===429){
            const seconds=String(e.message).match(/(\d+) 秒/);
            retryAfter=seconds?Math.min(3600,Number(seconds[1])):60;
            warning='AI 樂評暫時忙碌，已先提供歌曲簡介。';
          }else warning='AI 樂評暫時無法生成，已先提供歌曲簡介。';
          console.warn('Text generation unavailable:',e instanceof AIError?e.status:'unknown');
        }
      }
      return reply({mode:'recommend',song:picked.song,analysis:{...prefs,explanation:'依輸入的情境與歌曲標籤配對；標籤來自歌曲資料庫。'},
        matchScore:picked.matchScore,fallback:!!picked.fallback,review:writing.review,reason:writing.reason,
        imagePrompt:writing.imagePrompt,visualAccent:accent,textSource,warning,retryAfter},200,headers);
    }
    // /cover: 完全不呼叫 Groq。只有明確點選生成按鈕時才消耗 Workers AI 額度。
    if(!env.AI || !env.COVER_LIMITER)return reply({error:'尚未設定 Workers AI 或 COVER_LIMITER 綁定。'},503,headers);
    const id=typeof body.songId==='string'?body.songId:'';
    const song=SONGS.find(item=>item.id===id);
    if(!song)return reply({error:'歌曲 ID 不在資料庫內。'},400,headers);
    // 不信任前端提供的完整 Prompt；歌曲母題始終由伺服器資料庫決定。
    const prefs=cleanPreferences(body.preferences && typeof body.preferences==='object' && !Array.isArray(body.preferences)?body.preferences:{});
    const accent=visualAccent(body.visualAccent);
    const limited=await limitOrError(env.COVER_LIMITER,`cover:${ip}`,headers);
    if(limited)return limited;
    const prompt=prepareImagePrompt(song,prefs,accent);
    try {
      const result=await env.AI.run('@cf/black-forest-labs/flux-1-schnell',{prompt,steps:4});
      if(!result || typeof result.image!=='string'||!result.image.length)
        return reply({error:'圖片模型未回傳影像資料，請檢查 Workers AI Logs。'},502,headers);
      return reply({ok:true,mime:'image/jpeg',dataURI:`data:image/jpeg;base64,${result.image}`,
        model:'@cf/black-forest-labs/flux-1-schnell',source:'workers-ai',imagePrompt:prompt},200,headers);
    } catch(e) {
      // 不向前端暴露完整供應商錯誤回應或內部細節。
      return reply({error:'Cloudflare 圖片生成暫時失敗；可能是免費配額、模型限制或設定問題，請查看 Workers AI 用量與 Worker Logs。'},502,headers);
    }
  }
};
