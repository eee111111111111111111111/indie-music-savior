import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.mjs';
import { SONGS } from '../shared/catalog.mjs';
const base='https://indie-music-savior-api.example.workers.dev';
const origin='https://example.github.io';
const makeEnv=(extra={})=>({OPENAI_API_KEY:'fake-key',ALLOWED_ORIGIN:origin,OPENAI_MODEL:'gpt-4.1-mini',
  REQUEST_LIMITER:{limit:async()=>({success:true})}, ...extra});
const req=(path='/recommend',body={mode:'mood',mood:'陰雨夜晚的憂傷 shoegaze'})=>new Request(base+path,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
test('only original 10 songs and unique video IDs',()=>{
  assert.equal(SONGS.length,10);assert.equal(new Set(SONGS.map(s=>s.id)).size,SONGS.length);
});
test('status does not leak key',async()=>{
  const r=await worker.fetch(new Request(base+'/status',{headers:{origin}}),makeEnv());
  const data=await r.json();assert.equal(r.status,200);assert.equal(data.configured,true);assert.ok(!JSON.stringify(data).includes('fake-key'));
});
test('reject other origins and missing secrets',async()=>{
  const wrong=new Request(base+'/recommend',{method:'POST',headers:{origin:'https://evil.example','content-type':'application/json'},body:JSON.stringify({mode:'random'})});
  assert.equal((await worker.fetch(wrong,makeEnv())).status,403);
  assert.equal((await worker.fetch(req(),makeEnv({OPENAI_API_KEY:''}))).status,503);
});
test('rate limit before LLM call',async()=>{
  assert.equal((await worker.fetch(req(),makeEnv({REQUEST_LIMITER:{limit:async()=>({success:false})}}))).status,429);
});
test('OPTIONS preflight uses single approved origin',async()=>{
  const r=await worker.fetch(new Request(base+'/recommend',{method:'OPTIONS',headers:{origin,'access-control-request-method':'POST'}}),makeEnv());
  assert.equal(r.status,204);assert.equal(r.headers.get('access-control-allow-origin'),origin);
});
test('true LLM flow with mocked OpenAI responses',async()=>{
  const old=globalThis.fetch;let count=0;
  globalThis.fetch=async(url,opt)=>{
    assert.equal(url,'https://api.openai.com/v1/responses');count++;
    const generated=count===1?{moods:['melancholic'],genres:['shoegaze'],scenes:['rainy'],instruments:[],energy:'low',explanation:'陰雨天的低落心情。'}:
      {review:'這是一段由模型產生的測試微型樂評。',reason:'選出的歌曲標籤與憂傷感受相符。',imagePrompt:'Original square indie vinyl album artwork, rainy day, muted blue, 35mm grain, no text, no existing album cover'};
    return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(generated)}]}]});
  };
  try {
    const r=await worker.fetch(req(),makeEnv());const data=await r.json();
    assert.equal(r.status,200);assert.equal(count,2);
    assert.equal(data.mode,'ai');assert.ok(SONGS.some(s=>s.id===data.song.id));assert.ok(data.imagePrompt.includes('square'));
  }finally{globalThis.fetch=old;}
});
