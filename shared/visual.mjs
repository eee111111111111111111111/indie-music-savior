// 封面設計以歌曲專屬的視覺母題為主。資料庫內容是創意詮釋，不代表已分析音訊或歌詞。
const list=(value,n=3)=>Array.isArray(value)?value.filter(v=>typeof v==='string').slice(0,n).join(', '):'';
const safeAccents=['soft light','diffused light','backlight','warm light','cool light','film grain','paper texture','halftone','watercolor wash','subtle grain','soft shadows','long exposure','negative space','muted contrast','high contrast'];
// 從 LLM 視覺提案提取可控的光線/質感修飾，不讓它覆蓋歌曲母題、配色與構圖。
export function visualAccent(value=''){
  const text=typeof value==='string'?value.toLowerCase():'';
  return safeAccents.filter(v=>text.includes(v)).slice(0,2).join(', ');
}
export function coverPrompt(song,prefs={},accent=''){
  const art=song.cover_art||{};
  const motif=art.motif||`an evocative original scene inspired by the title ${song.title}`;
  const style=art.style||'independent editorial illustration';
  const palette=art.palette||list(song.color_palette)||'muted contrasting colors';
  const mood=list(song.mood)||'reflective';
  const genre=list(song.genre,2)||'indie';
  const energy=song.energy==='high'?'dynamic framing, bold visual rhythm':song.energy==='low'?'quiet spacious framing, restrained movement':'balanced framing, subtle visual movement';
  const listener=[list(prefs.moods,2),list(prefs.scenes,2)].filter(Boolean).join('; ');
  const finish=visualAccent(accent);
  return [
    `Original square 1:1 album-cover artwork for the song ${JSON.stringify(song.title)} by ${song.artist}; title and artist are context only, never printed.`,
    `MAIN SUBJECT: ${motif}.`,
    `ART DIRECTION: ${style}; color palette: ${palette}.`,
    `Song mood: ${mood}; genre: ${genre}; ${energy}.`,
    list(song.instruments,3)?`Translate ${list(song.instruments,3)} into visual rhythm and texture, not literal instruments.`:'',
    listener?`Secondary listener atmosphere: ${listener}; modify lighting or atmosphere only, keep the main subject and palette.`:'',
    finish?`Optional finishing touches, if consistent with the art direction: ${finish}.`:'',
    'One cohesive full-bleed artwork, clear focal point, no vinyl disc, no sleeve mockup, no text, no lettering, no logos, no recognizable musicians, no replica of existing album art.'
  ].filter(Boolean).join(' ');
}
export function prepareImagePrompt(song,prefs={},accent=''){
  return coverPrompt(song,prefs,accent);
}
export function fallbackWriting(song,prefs){
  const genres=song.genre.slice(0,2).join('、')||'獨立音樂';
  const moods=song.mood.slice(0,2).join('、')||'細膩';
  const note=String(song.note||'').replace(/^【[^】]+】\s*/,'');
  // 資料庫分類尚待複核；不把簡介稱作生成樂評。
  return {review:note||`這首歌的資料庫標籤為 ${genres}、${moods}。`,
    reason:`依歌曲資料庫的 ${genres} 與 ${moods} 標籤進行配對。`,
    imagePrompt:coverPrompt(song,prefs)};
}
