/** 推薦演算法：只從 SONGS 中選出既有歌曲，LLM 不得製造歌曲。 */
export const TAGS = {
  moods: ["melancholic","lonely","dreamy","nostalgic","relaxed","energetic","romantic","warm","hopeful","introspective","carefree","angry"],
  genres: ["indie pop","indie rock","dream pop","shoegaze","lo-fi","bedroom pop","alternative rock","post-punk","indie funk"],
  scenes: ["rainy","cloudy","night","morning","sunset","coffee","study","walking","drive","weekend","city"],
  instruments: ["guitar","fuzzy guitar","synth","bass","drums","soft vocals"],
  energies: ["low","medium","high","any"]
};
export function cleanPreferences(pref = {}) {
  const result = {};
  for (const key of ["moods","genres","scenes","instruments"]) {
    const arr=Array.isArray(pref[key]) ? pref[key] : [];
    result[key] = [...new Set(arr.filter(v=>typeof v==='string' && TAGS[key].includes(v)))].slice(0,5);
  }
  result.energy = TAGS.energies.includes(pref.energy) ? pref.energy : 'any';
  return result;
}
const match=(needles, values)=>needles.length ? needles.filter(v=>values.includes(v)).length / needles.length : null;
export function scoreSong(song,prefs) {
  const p=cleanPreferences(prefs);
  const categories=[
    [0.40,match(p.moods,song.mood)],
    [0.30,match(p.genres,song.genre)],
    [0.10,match(p.scenes,song.scene)],
    [0.10,match(p.instruments,song.instruments)],
    [0.10,p.energy==='any'?null:p.energy===song.energy?1:song.energy==='medium'?0.4:0]
  ];
  let sum=0, weight=0;
  for(const [w,v] of categories) if(v!==null){sum+=w*v;weight+=w;}
  return weight?Math.round(sum/weight*100):0;
}
export function selectSong(songs,prefs,previousId=null,mode='mood',random=Math.random) {
  if(!songs.length) throw new Error('No songs available');
  if(mode==='random') {
    const pool=songs.filter(s=>s.id!==previousId);
    const candidates=pool.length?pool:songs;
    return {song:candidates[Math.floor(random()*candidates.length)],matchScore:null};
  }
  const scored=songs.map(song=>({song,matchScore:scoreSong(song,prefs)})).sort((a,b)=>b.matchScore-a.matchScore);
  const positive=scored.filter(x=>x.matchScore>0);
  if(!positive.length) return {...selectSong(songs,prefs,previousId,'random',random),fallback:true};
  const best=positive.slice(0,5);
  const withoutPrevious=best.filter(x=>x.song.id!==previousId);
  const pool=withoutPrevious.length?withoutPrevious:best;
  const weights=pool.map(x=>Math.max(0.05,x.matchScore/100)**2);
  const total=weights.reduce((a,b)=>a+b,0);
  let choice=random()*total;
  for(let i=0;i<pool.length;i++){choice-=weights[i];if(choice<0)return {...pool[i],fallback:false};}
  return {...pool[pool.length-1],fallback:false};
}
export function localPreferences(text){
  const mappings={
    moods:{melancholic:['憂傷','悲傷','難過','陰鬱','sad'],lonely:['孤單','寂寞','失戀','lonely'],dreamy:['夢幻','迷幻','朦朧','dreamy'],nostalgic:['懷舊','回憶','復古','nostalgic'],relaxed:['放鬆','悠閒','舒服','平靜','chill'],energetic:['熱血','活力','快節奏','energetic'],romantic:['浪漫','戀愛','心動','romantic'],warm:['溫暖','療癒','warm'],hopeful:['希望','振作','hopeful'],introspective:['沉澱','思考','心事'],carefree:['快樂','開心','自由','輕快'],angry:['生氣','煩躁','憤怒','angry']},
    genres:{'indie rock':['搖滾','indie rock'],'dream pop':['dream pop','夢幻流行'],'shoegaze':['shoegaze','瞪鞋','模糊吉他'],'lo-fi':['lo-fi','lofi','低傳真'],'indie pop':['indie pop','獨立流行'],'post-punk':['後龐克','post-punk'],'bedroom pop':['臥室流行'],'alternative rock':['另類搖滾'],'indie funk':['放克','funk']},
    scenes:{rainy:['雨','rain'],cloudy:['陰天','多雲','cloudy'],night:['夜','凌晨','night'],morning:['早晨','早上','清晨'],sunset:['黃昏','夕陽','傍晚'],coffee:['咖啡','coffee'],study:['讀書','作業','專心'],walking:['散步','走路'],drive:['開車','兜風'],weekend:['週末','假日'],city:['城市','街頭']},
    instruments:{'fuzzy guitar':['破音','失真','fuzz'],'guitar':['吉他','guitar'],'synth':['合成器','synth'],'bass':['貝斯','bass'],'drums':['鼓','drums'],'soft vocals':['輕聲','柔和人聲']}
  };
  const lower=text.toLowerCase(); const output={};
  for(const [key,table] of Object.entries(mappings)) output[key]=Object.entries(table).filter(([,words])=>words.some(w=>lower.includes(w.toLowerCase()))).map(([tag])=>tag);
  output.energy=/快節奏|很吵|熱血|激烈|fast|loud/.test(lower)?'high':/緩慢|安靜|低能量|slow|soft/.test(lower)?'low':'any';
  return cleanPreferences(output);
}
export function buildDemo(song,prefs){
  const moodDescription=(prefs.moods.length?prefs.moods.join(', '):song.mood.slice(0,2).join(', '));
  return {
    review:`有些旋律不急著替你回答問題，只是替現在的情緒留一點空白。${song.artist} 的〈${song.title}〉被資料庫標記為 ${song.genre.join('、')}，這樣的聲音輪廓適合今天想慢慢感受音樂的你。`,
    reason:`根據資料庫的 ${[...song.mood.slice(0,2),...song.genre.slice(0,1)].join('、')} 標籤進行匹配；這是程式規則示範，並非 AI 理解結果。`,
    imagePrompt:`Original square indie record sleeve illustration, a solitary figure looking through a rain-kissed window, introspective and cinematic atmosphere, moods: ${moodDescription}, genres: ${song.genre.join(', ')}, muted color palette ${song.color_palette.join(', ')}, 35mm film grain, aged paper texture, subtle halftone printing, handmade collage, artistic negative space, no text, no logos, no existing album artwork, no artist likeness, no copyrighted characters.`,
  };
}
