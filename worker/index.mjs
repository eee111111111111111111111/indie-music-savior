import { SONGS } from '../shared/catalog.mjs';
import { analyzeEmotion, writeReviewAndPrompt, AIError, providerConfig } from '../shared/openai.mjs';
import { cleanPreferences, selectSong } from '../shared/recommender.mjs';

function reply(payload, status=200, headers={}) {
  return Response.json(payload, { status, headers: {
    'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', ...headers
  }});
}
function corsFor(origin, env) {
  return origin && env.ALLOWED_ORIGIN && origin === env.ALLOWED_ORIGIN
    ? {'Access-Control-Allow-Origin': origin, 'Vary':'Origin',
       'Access-Control-Allow-Methods':'GET, POST, OPTIONS',
       'Access-Control-Allow-Headers':'Content-Type'} : {};
}
export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    const origin = request.headers.get('origin');
    const headers = corsFor(origin, env);
    if (request.method === 'OPTIONS') {
      if (!origin || origin !== env.ALLOWED_ORIGIN) return reply({error:'Origin 不允許。'},403);
      return new Response(null,{status:204,headers:{...headers,'Access-Control-Max-Age':'600'}});
    }
    if (path === '/status' && request.method === 'GET') {
      try {
        const config=providerConfig(env);
        return reply({ok:true,configured:!!(config.key && env.ALLOWED_ORIGIN),provider:config.provider,model:config.model},200,headers);
      } catch(e) {return reply({ok:false,error:e.message},503,headers);}
    }
    if (path !== '/recommend') return reply({error:'找不到 API 路徑。'},404,headers);
    if (request.method !== 'POST') return reply({error:'請使用 POST。'},405,headers);
    if (!origin || !env.ALLOWED_ORIGIN || origin !== env.ALLOWED_ORIGIN)
      return reply({error:'禁止來自其他網站的請求。'},403,headers);
    let config;
    try { config=providerConfig(env); }
    catch(e) { return reply({error:e.message},503,headers); }
    if (!config.key) return reply({error:`尚未設定 ${config.keyName}。`},503,headers);
    if (!env.REQUEST_LIMITER) return reply({error:'未啟用伺服器端請求限制，暫停 AI 服務。'},503,headers);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      return reply({error:'請以 JSON 格式傳入資料。'},415,headers);
    if (Number(request.headers.get('content-length')||0) > 4096)
      return reply({error:'請求過長。'},413,headers);
    const raw=await request.text();
    if (raw.length>4096) return reply({error:'請求過長。'},413,headers);
    let body;
    try {body=JSON.parse(raw);} catch {return reply({error:'JSON 格式錯誤。'},400,headers);}
    const mode = body?.mode === 'random' ? 'random' : 'mood';
    const mood = typeof body?.mood === 'string' ? body.mood.trim() : '';
    if (mood.length>220 || (mode==='mood' && !mood)) return reply({error:'心情描述限 1～220 字。'},400,headers);
    const previousId = typeof body?.previousId==='string' ? body.previousId.slice(0,25) : null;
    // 依 IP 進行簡易限流；此機制為近似值、非全球嚴格上限。
    const ip=request.headers.get('cf-connecting-ip')||'unknown';
    try {
      const {success}=await env.REQUEST_LIMITER.limit({key:`indie:${ip}`});
      if (!success) return reply({error:'AI 使用次數過於頻繁，請稍後再試。'},429,headers);
    }catch{return reply({error:'請求保護服務暫時無法使用。'},503,headers);}
    try {
      const analysis = mode==='mood' ? await analyzeEmotion(mood,env) : null;
      const prefs=cleanPreferences(analysis||{});
      const picked=selectSong(SONGS,prefs,previousId,mode);
      const generated=await writeReviewAndPrompt({
        text:mode==='random'?'隨機抽歌，依選中的歌曲標籤寫作。':mood,
        song:picked.song,preferences:prefs
      },env);
      if (![generated.review,generated.reason,generated.imagePrompt].every(x=>typeof x==='string'&&x.trim()))
        throw new AIError('AI 回應不完整。');
      return reply({mode:'ai',song:picked.song,analysis:{...prefs,explanation:analysis?.explanation||'隨機抽歌不額外分析心情。'},
        matchScore:picked.matchScore,fallback:!!picked.fallback,
        review:generated.review,reason:generated.reason,imagePrompt:generated.imagePrompt},200,headers);
    }catch(e){
      if(e instanceof AIError)return reply({error:e.message},e.status,headers);
      return reply({error:'AI 暫時無法完成推薦，請稍後再試。'},500,headers);
    }
  }
};
