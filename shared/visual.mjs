/** 保底模式：只依歌曲資料庫做字串匹配，絕不偽裝成 LLM 生成。 */
export function fallbackWriting(song, prefs) {
  const genres = song.genre.slice(0, 2).join('、') || '獨立音樂';
  const moods = song.mood.slice(0, 2).join('、') || '細膩';
  return {
    review: `〈${song.title}〉由 ${song.artist} 演出。依據歌曲資料庫的 ${genres} 以及 ${moods} 標籤，這首歌適合放進此刻的播放清單。這段文字來自資料庫與固定規則，尚未經過語言模型生成。`,
    reason: `歌曲資料庫將這首歌標記為 ${genres}，情緒標籤包含 ${moods}；系統依這些標籤進行比對。`,
    imagePrompt: coverPrompt(song, prefs)
  };
}
/** 圖像內容與推薦獨立：即使 Groq 不可用，仍可從歌曲標籤生成圖片 Prompt。 */
export function coverPrompt(song, prefs={}) {
  const moods = (prefs.moods?.length?prefs.moods:song.mood).slice(0,3).join(', ');
  const genres = song.genre.slice(0,2).join(', ');
  const palette=(song.color_palette||[]).filter(v=>/^#[a-f0-9]{6}$/i.test(v)).slice(0,3).join(', ');
  return `Square original indie vinyl record sleeve artwork, cinematic analogue photography and handmade collage, ${moods} atmosphere, ${genres} visual aesthetics, abstract city skyline with soft reflections, soft shadows, tactile paper grain, subtle 35mm film noise, restrained composition, colors ${palette}, emotionally expressive, independent music artwork, no text, no letters, no typography, no logos, no artist likeness, no existing album cover.`;
}
export function prepareImagePrompt(song, suppliedPrompt='') {
  // 不直接把原始任意輸入送入圖像模型。限制文字長度並強制原創封面要求。
  const variant=typeof suppliedPrompt==='string' ? suppliedPrompt.trim().slice(0,600) : '';
  const chosen=variant || coverPrompt(song);
  return `Create an ORIGINAL square (1:1) indie vinyl record sleeve illustration. Visual direction: ${chosen}. Make it visually striking, cinematic and cohesive. No words, text, letters, typography, brand marks, logos, watermarks, existing album cover replicas, famous faces or recognizable musicians.`.slice(0,1200);
}
