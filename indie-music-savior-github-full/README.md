# 🎵 歌荒救星 V2.1（正式版）｜GitHub Pages + Cloudflare Workers

> 這份 ZIP 是根據原本 `indie-music-savior-v2-full.zip` 改造的**真實 LLM 版**，不是 V2 示範版。前端仍是原本的深色系黑膠網站，後端改用 Cloudflare Workers；瀏覽器不會接觸 OpenAI API Key。

## 本版做到什麼

- 輸入心情 → 即時 OpenAI 情緒分析（JSON Schema）→ 從歌曲資料庫推薦 → 即時生成繁體中文微型樂評與 Stable Diffusion 英文封面 Prompt。
- 隨機抽歌模式仍即時呼叫 LLM 寫樂評與 Prompt（不做情緒分析）。
- YouTube 透過官方 iframe 嵌入。
- 封面目前是 CSS 黑膠示意；**尚未使用 Stable Diffusion 生成實際圖片**，這是第三階段。
- **沒有預設樂評或假 AI 示範模式**。AI 後端未設定時，推薦按鈕會暫停並顯示設定資訊。
- 更新歌曲只需改 `docs/data/songs.json`，前端與後端都會使用同一份資料。

## 你不用安裝 VS Code 或 Python

這份專案可以直接透過 GitHub 網頁上傳，然後使用 GitHub Pages 和 Cloudflare 官方管理介面完成部署。Cloudflare 將代為執行 Wrangler 建置，不必安裝本機環境。

## 0. 檔案結構（一定要確認）

```text
indie-music-savior-github-full/
├── docs/                      ← GitHub Pages 發布的根目錄
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   ├── config.js              ← 最後需要填入 Worker 公開網址
│   └── data/songs.json        ← 唯一的歌曲資料來源
├── worker/index.mjs           ← Cloudflare Worker 真正的 LLM 後端
├── shared/
│   ├── catalog.mjs            ← 自動引用 docs/data/songs.json
│   ├── openai.mjs             ← OpenAI Responses API
│   └── recommender.mjs
├── tests/worker.test.mjs
├── wrangler.jsonc             ← Worker 名稱、入口與限流設定
├── package.json
└── README.md
```

## 1. GitHub 上傳完整原始碼

1. 下載並解壓縮本 ZIP，找到裡面包含 `docs`、`worker`、`shared`、`wrangler.jsonc` 的資料夾。
2. 登入 https://github.com ，開啟 https://github.com/new 。
3. Repository name：`indie-music-savior`；Visibility：**Public**；建立 Repository。**不要放入任何 API Key。**
4. 在新 Repository 的 `uploading an existing file` 或 `Add file → Upload files` 頁面，上傳上面資料夾**裡面的全部內容**。不要把 ZIP 檔直接當網站上傳，也不要多包一層資料夾。
5. 點 `Commit changes`。回到 GitHub 檔案列表，第一層應該看到 `docs`、`worker`、`shared`、`wrangler.jsonc`、`package.json`。

如果 `docs` 被放在 `indie-music-savior-github-full/docs`，代表多了一層，請修正到 Repository 根目錄再繼續。

## 2. 啟用 GitHub Pages（只發布前端）

1. GitHub Repository → `Settings` → `Pages`。
2. `Build and deployment`：Source 選 `Deploy from a branch`。
3. Branch 選 `main`，資料夾選 **`/docs`**，按 `Save`。**不要選 `/(root)`**。
4. 等待 GitHub Pages 部署完成，頁面會提供網址，例如：
   `https://你的帳號.github.io/indie-music-savior/`
5. 開啟網址：此時應顯示歌荒救星 V2 網頁，但會提示「AI 尚未連接」。這是正常的，因為後端還沒設定。

## 3. 建立 Cloudflare Worker（安全的即時 AI 後端）

1. 登入 https://dash.cloudflare.com/ 。
2. 到 `Workers & Pages` → `Create`，找 **Connect to Git / Import a repository**（不同版本 UI 名稱略有不同）。
3. 選擇 **Worker**（不是 Pages），並授權存取剛剛的 GitHub Repository `indie-music-savior`。
4. 建立 Worker，名稱務必設為 **`indie-music-savior-api`**，須與 `wrangler.jsonc` 內 `name` 相同。
5. 專案設定：
   - Git repository：`indie-music-savior`
   - Production branch：`main`
   - Root directory：Repository **根目錄**（空白、`/` 或 `.` 視介面提示）
   - Build command：留空（如果要求填寫，請參閱 Cloudflare 預設值）
   - Deploy command：`npx wrangler deploy`
6. 點 Deploy，查看結果是否成功。Worker 最後應該有 `https://indie-music-savior-api.<你的Cloudflare子網域>.workers.dev` 一類網址。
7. 開啟 `https://...workers.dev/status`，如果 Worker 已部署且尚未設定環境變數，應看到 `"configured":false`。

Cloudflare 官方 GitHub 整合文件：
https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/

## 4. 設定 Cloudflare Worker 的環境變數與 Secret

到 Cloudflare Dashboard → Workers & Pages → `indie-music-savior-api` → `Settings` → `Variables and Secrets` → `Add`：

### A. `OPENAI_API_KEY`（**類型選 Secret**）

- 到 https://platform.openai.com/api-keys 建立 API Key。
- 貼到 Secret 的 Value 欄。
- **絕不**貼在 GitHub、`config.js`、網頁前端、README、聊天室，或當成普通文字變數。
- OpenAI API 和 ChatGPT 訂閱是分開計費的；應先檢查餘額及使用量。

### B. `ALLOWED_ORIGIN`（類型 Text）

這是**GitHub Pages 網站的 Origin**，例如：

```text
https://你的帳號.github.io
```

**不要加** `/indie-music-savior/`，**不要有尾端斜線**。如果你用自訂網域，需改成實際的 origin。

### C. `OPENAI_MODEL`（可選 Text）

```text
gpt-4.1-mini
```

儲存並依 Cloudflare 畫面按 `Deploy` 更新 Worker。再打開 `https://...workers.dev/status`，看到 `"configured":true` 表示後端讀得到設定（不代表 API 額度已驗證）。

⚠️ **安全注意：** 本版有 CORS Origin 檢查與 6 次／分鐘／IP 的 Cloudflare Rate Limiting binding。但 Origin 可以被非瀏覽器程式偽造，而且限流是近似且分區運作，**無法保證完全不被濫用或產生 API 費用**。公開網站前請設定 OpenAI 用量警示並監控用量；如果發生異常，立刻停用 Worker、移除 Secret 或撤銷 API Key。

## 5. 將 Worker 公開網址連到 GitHub Pages 網站

1. 到 GitHub Repository → `docs` → `config.js`。
2. 點鉛筆 `Edit this file`，將

   ```js
   export const API_BASE = "";
   ```

   改成

   ```js
   export const API_BASE = "https://indie-music-savior-api.你的子網域.workers.dev";
   ```

3. 請使用 **Cloudflare 真正提供的網址**，不是上面的範例。
4. 點 `Commit changes`。等 GitHub Pages 更新。
5. 重新開啟 GitHub Pages 網站，右上角應顯示 `✦ AI 已連線`。
6. 輸入 `陰天下午想聽憂傷的 Shoegaze 搖滾` → 按 **依心情找歌**。成功時應出現 AI 微型樂評、情緒標籤、Stable Diffusion Prompt 和 YouTube 播放器。

## 6. 新增或修改歌曲：只改一個檔案！

1. 到 GitHub Repository → `docs/data/songs.json` → 鉛筆編輯。
2. 修改歌曲資訊或新增一筆 JSON 物件。不要使用重複的 `id` 或錯誤的 `youtube_id`。
3. `Commit changes`。GitHub Pages 會更新前端 JSON，而 Cloudflare Workers 的 Git 整合也會重新部署最新的同一份 JSON。
4. 部署都完成後，重新整理網站；推薦演算法即使用新的歌曲資料。

**注意：** 更新不是瞬間，兩個部署系統各有各的部署時間。在尚未完全發布時，短暫出現前後端歌曲清單不同步是可能的。

## 7. 常見錯誤

| 問題 | 請檢查 |
|---|---|
| GitHub Pages 404 | `Settings → Pages` 是否選 `main /docs`；`docs/index.html` 是否存在 |
| GitHub Pages 正常，但顯示 AI 尚未連接 | `docs/config.js` 是否填了正確 Worker URL |
| Worker `/status` 404 | Cloudflare Worker 是否成功部署、URL 是否正確、路徑是否 `/status` |
| Worker `configured:false` | Cloudflare 中 `OPENAI_API_KEY`（Secret）與 `ALLOWED_ORIGIN`（Text）是否設定 |
| 網頁 `403`、CORS | `ALLOWED_ORIGIN` 必須是精確的 `https://帳號.github.io`，不含路徑或結尾 `/` |
| 網頁 `429` | 限流被觸發，或 OpenAI API 的額度／速率已用盡 |
| 網頁 `502` | 檢查 OpenAI Key、有無可用額度、模型是否支援 JSON Schema，並查看 Cloudflare Worker Logs |
| 網頁有歌曲但未產生真正封面 | 正常：V2 **只生成圖片 Prompt**，尚未接 Stable Diffusion |

## 8. 技術細節

- `docs/app.js`：網頁事件、呼叫 Worker、渲染結果
- `worker/index.mjs`：`GET /status` 與 `POST /recommend`，CORS、JSON 驗證、Rate Limiting
- `shared/openai.mjs`：OpenAI Responses API，兩次 LLM JSON Schema 呼叫
- `shared/recommender.mjs`：候選歌曲選擇與相似度演算法
- `shared/catalog.mjs`：從 `docs/data/songs.json` 匯入，維持單一資料庫
- `wrangler.jsonc`：Cloudflare Worker 部署與限流設定
- `tests/worker.test.mjs`：使用**模擬 OpenAI 回應**驗證 API 流程；無真實 API Key 的測試不會產生費用

## 9. 進度說明

本版在產生時完成 JavaScript 語法測試與 6 項 Node.js 自動測試，**未使用真實 OpenAI API Key 呼叫或 Cloudflare 正式部署**。上線後仍須在你的帳號環境完成端對端驗收。
