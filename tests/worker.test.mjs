import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.mjs';
import {SONGS} from '../shared/catalog.mjs';
const host='https://example.workers.dev', origin='https://student.github.io';
const makeEnv=(more={})=>({
  AI_PROVIDER:'groq',GROQ_API_KEY:'fake-groq-secret',ALLOWED_ORIGIN:origin,
  REQUEST_LIMITER:{limit:async()=>({success:true})},COVER_LIMITER:{limit:async()=>({success:true})},
  AI:{run:async()=>({image:'aGVsbG8='})},...more
});
const call=(path,body,fromOrigin=origin)=>new Request(host+path,{method:'POST',headers:{origin:fromOrigin,'content-type':'application/json'},body:JSON.stringify(body)});
const status=(env)=>worker.fetch(new Request(host+'/status',{headers:{origin}}),env);
const mood={mode:'mood',mood:'陰天下午有點憂傷，想聽 shoegaze 音樂'};
test('source database remains curated and safe',()=>{
  assert.equal(SONGS.length,10);
  assert.equal(new Set(SONGS.map(s=>s.id)).size,10);
});
test('status reveals readiness and never reveals secrets',async()=>{
  const r=await status(makeEnv());const data=await r.json();
  assert.equal(data.version,'3.0');assert.equal(data.recommendReady,true);
  assert.equal(data.imageReady,true);assert.equal(data.llmReady,true);
  assert.ok(!JSON.stringify(data).includes('fake-groq-secret'));
});
test('status distinguishes optional Groq from zero-token recommendation',async()=>{
  const data=await (await status(makeEnv({GROQ_API_KEY:''}))).json();
  assert.equal(data.llmReady,false);assert.equal(data.configured,false);
  assert.equal(data.recommendReady,true);assert.equal(data.imageReady,true);
});
test('economy mode selects real song without any LLM network calls',async()=>{
  const old=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('Groq must not be called in economy mode');};
  try{
    const r=await worker.fetch(call('/recommend',{...mood,useLLM:false}),makeEnv({GROQ_API_KEY:''}));
    const data=await r.json();assert.equal(r.status,200);assert.equal(data.textSource,'rules');
    assert.ok(SONGS.some(x=>x.id===data.song.id));assert.match(data.review,/固定規則/);assert.match(data.imagePrompt,/square/i);
  }finally{globalThis.fetch=old;}
});
test('LLM mode makes one Groq request only, with low reasoning and constrained JSON',async()=>{
  const old=globalThis.fetch;let calls=0;
  globalThis.fetch=async(url,opt)=>{
    calls++;assert.equal(url,'https://api.groq.com/openai/v1/responses');
    const body=JSON.parse(opt.body);
    assert.equal(body.model,'openai/gpt-oss-20b');
    assert.equal(body.reasoning.effort,'low');
    assert.equal(body.max_output_tokens,650);
    assert.equal(body.store,undefined);
    assert.equal(body.text.format.type,'json_schema');
    assert.equal(body.text.format.strict,true);
    return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({review:'由 LLM 生成的作品描述',reason:'由 LLM 生成的選歌原因',imagePrompt:'Square original vinyl album art, warm misty sunset, film grain, no lettering'})}]}]});
  };
  try{
    const r=await worker.fetch(call('/recommend',{...mood,useLLM:true}),makeEnv());
    const data=await r.json();assert.equal(r.status,200);assert.equal(data.textSource,'llm');assert.equal(calls,1);
    assert.match(data.review,/LLM/);
  }finally{globalThis.fetch=old;}
});
test('Groq 429 gracefully degrades to rule-based text, never pretends LLM',async()=>{
  const old=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({error:'rate_limit'}),{status:429,headers:{'retry-after':'21'}});
  try{
    const r=await worker.fetch(call('/recommend',{...mood,useLLM:true}),makeEnv());
    const data=await r.json();assert.equal(r.status,200);
    assert.equal(data.textSource,'fallback');assert.match(data.warning,/21 秒/);assert.match(data.review,/固定規則/);
  }finally{globalThis.fetch=old;}
});
test('image generation calls real configured AI binding but not Groq',async()=>{
  const old=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('Groq must not run for cover');};
  let seen=null;const env=makeEnv({AI:{run:async(model,input)=>{seen={model,input};return {image:'aGVsbG8='};}}});
  try{
    const r=await worker.fetch(call('/cover',{songId:SONGS[0].id,imagePrompt:'Dark rainy city, blue-purple ambience'}),env);
    const data=await r.json();assert.equal(r.status,200);assert.equal(data.source,'workers-ai');
    assert.equal(data.dataURI,'data:image/jpeg;base64,aGVsbG8=');
    assert.equal(seen.model,'@cf/black-forest-labs/flux-1-schnell');
    assert.equal(seen.input.steps,4);assert.match(seen.input.prompt,/No words/);
  }finally{globalThis.fetch=old;}
});
test('cover endpoint rejects invalid IDs, rate limit, and disabled binding',async()=>{
  assert.equal((await worker.fetch(call('/cover',{songId:'not-a-real-song'}),makeEnv())).status,400);
  assert.equal((await worker.fetch(call('/cover',{songId:SONGS[0].id}),makeEnv({AI:undefined}))).status,503);
  assert.equal((await worker.fetch(call('/cover',{songId:SONGS[0].id}),makeEnv({COVER_LIMITER:{limit:async()=>({success:false})}}))).status,429);
});
test('CORS rejects unauthorized origins for text and images',async()=>{
  assert.equal((await worker.fetch(call('/recommend',mood,'https://other.site'),makeEnv())).status,403);
  assert.equal((await worker.fetch(call('/cover',{songId:SONGS[0].id},'https://other.site'),makeEnv())).status,403);
  const preflight=await worker.fetch(new Request(host+'/cover',{method:'OPTIONS',headers:{origin,'access-control-request-method':'POST'}}),makeEnv());
  assert.equal(preflight.status,204);
  assert.equal(preflight.headers.get('access-control-allow-origin'),origin);
});
test('REQUEST_LIMITER protects economy mode as well',async()=>{
  const r=await worker.fetch(call('/recommend',mood),makeEnv({REQUEST_LIMITER:{limit:async()=>({success:false})}}));
  assert.equal(r.status,429);
});
