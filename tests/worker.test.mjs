import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.mjs';
import {SONGS} from '../shared/catalog.mjs';
import { fallbackWriting, prepareImagePrompt } from '../shared/visual.mjs';
import { readFileSync } from 'node:fs';
import { localPreferences, scoreSong, selectSong } from '../shared/recommender.mjs';
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
  assert.ok(SONGS.length>=130);
  assert.equal(new Set(SONGS.map(s=>s.id)).size,SONGS.length);
  assert.equal(new Set(SONGS.map(s=>s.youtube_id)).size,SONGS.length);
  for (const song of SONGS) {
    assert.match(song.youtube_id,/^[A-Za-z0-9_-]{11}$/);
    for(const key of ['title','artist','note']) assert.ok(song[key]);
    for(const key of ['genre','mood','scene','instruments']) assert.ok(Array.isArray(song[key]));
    for(const key of ['motif','style','palette']) assert.ok(song.cover_art[key]);
  }
});
test('status reveals readiness and never reveals secrets',async()=>{
  const r=await status(makeEnv());const data=await r.json();
  assert.equal(data.version,'3.1');assert.equal(data.interaction,'local-random-v1');assert.equal(data.coverStyle,'soft-analog');assert.equal(data.recommendReady,true);
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
    assert.ok(SONGS.some(x=>x.id===data.song.id));assert.equal(data.review,fallbackWriting(data.song,data.analysis).review);assert.match(data.imagePrompt,/square/i);
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
    assert.equal(data.textSource,'fallback');assert.equal(data.retryAfter,21);assert.match(data.warning,/歌曲簡介/);assert.equal(data.review,fallbackWriting(data.song,data.analysis).review);
  }finally{globalThis.fetch=old;}
});
test('image generation calls the mocked AI binding but not Groq',async()=>{
  const old=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('Groq must not run for cover');};
  let seen=null;const env=makeEnv({AI:{run:async(model,input)=>{seen={model,input};return {image:'aGVsbG8='};}}});
  try{
    const r=await worker.fetch(call('/cover',{songId:SONGS[0].id,imagePrompt:'Dark rainy city, blue-purple ambience'}),env);
    const data=await r.json();assert.equal(r.status,200);assert.equal(data.source,'workers-ai');
    assert.equal(data.dataURI,'data:image/jpeg;base64,aGVsbG8=');
    assert.equal(seen.model,'@cf/black-forest-labs/flux-1-schnell');
    assert.equal(seen.input.steps,4);assert.ok(seen.input.prompt.includes(SONGS[0].cover_art.motif));assert.match(seen.input.prompt,/text, logos/);assert.equal(data.imagePrompt,seen.input.prompt);assert.ok(!seen.input.prompt.includes('Dark rainy city, blue-purple ambience'));
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


test('frontend and backend cover prompt modules remain identical',()=>{
  const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
  assert.equal(read('../docs/cover-preview.mjs'),read('../shared/visual.mjs'));
});
test('every song has its own prompt and a restrained visual palette',()=>{
  const prompts=SONGS.map(song=>prepareImagePrompt(song,{},'neon, soft light'));
  assert.equal(new Set(prompts).size,SONGS.length);
  for(let i=0;i<SONGS.length;i++){
    assert.ok(prompts[i].includes(SONGS[i].cover_art.motif));
    assert.match(prompts[i],/low-chroma/);
    assert.match(prompts[i],/Subtle finish: soft light/);
  }
});
test('mood preferences and score use catalog tags, not invented songs',()=>{
  const prefs=localPreferences('陰天下午有點憂傷，想聽 lo-fi 吉他');
  assert.ok(prefs.moods.includes('melancholic'));
  assert.ok(prefs.genres.includes('lo-fi'));
  assert.ok(prefs.scenes.includes('cloudy'));
  assert.ok(prefs.instruments.includes('guitar'));
  const song=SONGS[0];
  assert.equal(scoreSong(song,{moods:[song.mood[0]]}),100);
  const picked=selectSong(SONGS,prefs,null,'mood',()=>0);
  assert.ok(SONGS.some(s=>s.id===picked.song.id));
  assert.ok(picked.matchScore>0);
  const random=selectSong(SONGS,{},song.id,'random',()=>0);
  assert.notEqual(random.song.id,song.id);
});
test('review route retains chosen song and rejects invalid IDs',async()=>{
  const old=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>{calls++;return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({review:'樂評',reason:'理由',imagePrompt:'soft light'})}]}]});};
  try{
    const r=await worker.fetch(call('/recommend',{mode:'review',songId:SONGS[1].id,mood:'',useLLM:true}),makeEnv());
    const data=await r.json();assert.equal(r.status,200);assert.equal(data.song.id,SONGS[1].id);assert.equal(data.textSource,'llm');assert.equal(calls,1);
    assert.equal((await worker.fetch(call('/recommend',{mode:'review',songId:'missing'}),makeEnv())).status,400);
    assert.equal(calls,1);
  }finally{globalThis.fetch=old;}
});
test('cover cooldown exposes a retry hint without calling image model',async()=>{
  let calls=0;
  const response=await worker.fetch(call('/cover',{songId:SONGS[0].id}),makeEnv({COVER_LIMITER:{limit:async()=>({success:false})},AI:{run:async()=>{calls++;}}}));
  assert.equal(response.status,429);assert.equal(response.headers.get('Retry-After'),'60');
  assert.equal((await response.json()).retryAfter,60);assert.equal(calls,0);
  assert.match(response.headers.get('Access-Control-Expose-Headers'),/Retry-After/);
});
