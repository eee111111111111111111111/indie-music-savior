// 以歌曲母題為核心：低飽和、自然材質、獨立唱片印刷質感。
const list=(value,n=3)=>Array.isArray(value)?value.filter(v=>typeof v==='string').slice(0,n).join(', '):'';
const safeAccents=['diffused light','soft light','film grain','paper texture','subtle grain','soft shadows','negative space'];
export function visualAccent(value=''){
  const text=typeof value==='string'?value.toLowerCase():'';
  return safeAccents.filter(v=>text.includes(v)).slice(0,2).join(', ');
}
export function coverPrompt(song,prefs={},accent=''){
  const art=song.cover_art||{};
  const motif=art.motif||`a quiet visual metaphor inspired by ${song.title}`;
  const style=art.style||'understated analog photography on matte paper';
  const palette=art.palette||'dusty earth tones, washed blue, warm off-white';
  const energy=song.energy==='high'?'convey energy through asymmetrical framing and rhythm, not vivid color':song.energy==='low'?'quiet negative space and stillness':'restrained movement and balanced framing';
  const listener=[list(prefs.moods,2),list(prefs.scenes,2)].filter(Boolean).join('; ');
  const finish=visualAccent(accent);
  return [
    `Square original independent music album cover, full-bleed artwork for ${JSON.stringify(song.title)} by ${song.artist} (context only, not printed).`,
    `Main visual motif: ${motif}.`,
    `Medium: ${style}.`,
    `Palette: ${palette}, all low-chroma and gently faded, one muted accent occupying a small area. Soft tonal transitions, gentle contrast, softened highlights, open shadows.`,
    `Song atmosphere: ${list(song.mood)||'reflective'}; ${list(song.genre,2)||'indie'}; ${energy}.`,
    listener?`Listener atmosphere: ${listener}; subtly adjust light or atmosphere without replacing the motif or palette.`:'',
    finish?`Subtle finish: ${finish}.`:'',
    'Art direction: human-made independent record sleeve aesthetic, unpretentious, subtle analog imperfections, natural materials, simple composition and a clear focal point. Avoid glossy CGI, hyperreal digital rendering, fantasy effects, neon, fluorescent hues, oversaturated colors, HDR, dramatic lighting, harsh contrast, excessive detail, text, logos, artist likeness, existing album cover replicas, vinyl discs and product mockups.'
  ].filter(Boolean).join(' ');
}
export function prepareImagePrompt(song,prefs={},accent=''){return coverPrompt(song,prefs,accent);}
export function fallbackWriting(song,prefs){
  const genres=song.genre.slice(0,2).join('、')||'獨立音樂';
  const moods=song.mood.slice(0,2).join('、')||'細膩';
  const note=String(song.note||'').replace(/^【[^】]+】\s*/,'');
  // 資料庫分類尚待複核；不把簡介稱作生成樂評。
  return {review:note||`這首歌的資料庫標籤為 ${genres}、${moods}。`,
    reason:`依歌曲資料庫的 ${genres} 與 ${moods} 標籤進行配對。`,
    imagePrompt:coverPrompt(song,prefs)};
}
