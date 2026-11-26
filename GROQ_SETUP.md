# 部署與 API 設定

[返回專案首頁](README.md)

本文件對應目前的歌曲探索、Groq 微型樂評與 FLUX 封面生成功能。已部署的使用者只需更新原本 Repository；不要重新建立 Worker 或公開 API Key。

## 1. 部署 GitHub Pages

將專案內容放在 Repository 根目錄（不要再包一層資料夾或直接上傳 ZIP）。進入 `Settings → Pages → Build and deployment`，選擇 `Deploy from a branch`、`main`、`/docs`，儲存並確認發布成功。以 `Visit site` 顯示的網址為準。

## 2. 部署 Cloudflare Worker

在 Cloudflare Dashboard 的 Workers & Pages 建立或開啟現有 Worker，連接 GitHub Repository。正式分支為 `main`，根目錄為 Repository 根目錄，部署指令為 `npx wrangler deploy`。Worker 名稱必須與 `wrangler.jsonc` 的 `name` 一致。既有專案請保留目前名稱、相容日期與綁定設定。

## 3. 環境變數與模型

在 [Groq Console](https://console.groq.com/keys) 建立金鑰，然後前往 Worker 的 `Settings → Variables and Secrets` 新增 Secret `GROQ_API_KEY`，部署變更。不要把金鑰放到 GitHub、README、前端或一般 `vars` 中。

| 名稱 | 位置 | 設定 |
| --- | --- | --- |
| `AI_PROVIDER` | `wrangler.jsonc` → `vars` | `groq` |
| `GROQ_MODEL` | `vars` | `openai/gpt-oss-20b` |
| `ALLOWED_ORIGIN` | `vars` | GitHub Pages 的 origin，例如 `https://your-account.github.io`，不含路徑或尾端斜線 |
| `GROQ_API_KEY` | Cloudflare Secret | Groq 金鑰 |
| `AI` | `ai.binding` | Workers AI 綁定 |
| `REQUEST_LIMITER` | `ratelimits` | 心情推薦及指定歌曲樂評共用 |
| `COVER_LIMITER` | `ratelimits` | 圖片生成 |

目前上傳的設定中兩個 limiter 均為 10 次／60 秒，為近似每 IP 限制，不是服務商額度。不要以提高限流值作為增加免費配額的方法。圖片模型直接使用 `env.AI`，無須另一組圖片 API Key。

將 Worker 的實際公開 URL 填入 `docs/config.js` 的 `API_BASE`，不含 `/status` 或 `/recommend`。重新提交後確認 GitHub Pages 與 Worker 均完成部署。

### 可選：切換 OpenAI

將 `AI_PROVIDER` 改為 `openai`，可選填 `OPENAI_MODEL`（預設 `gpt-4.1-mini`），並在 Cloudflare 新增 `OPENAI_API_KEY` Secret。這是手動切換，不會在 Groq 超限時自動使用 OpenAI。OpenAI API 另行計費。

## 4. API 與驗收

開啟 Worker 公開網址加上 `/status`，確認 `ok`、`configured`、`recommendReady`、`llmReady`、`imageReady` 為 `true`，並確認 `provider`、`model` 與 `interaction: "local-random-v1"`。這只驗證設定存在，不保證金鑰、供應商額度或實際推論成功。

| 路徑 | 方法 | 輸入與用途 |
| --- | --- | --- |
| `/status` | GET | 服務就緒狀態，不回傳 Secret |
| `/recommend` | POST | `mode: "mood"`、`mood`、`previousId`、`useLLM`；心情配對與樂評 |
| `/recommend` | POST | `mode: "review"`、`songId`、`mood`、`useLLM`；指定歌曲樂評 |
| `/cover` | POST | `songId`、`preferences`、`visualAccent`；回傳 JPEG data URI 與實際 Prompt |

POST 請求需 JSON 與符合設定的 Origin。一般使用者請在網站操作，不需要手動呼叫 API。

驗收：隨機抽歌多次不發出推薦 API；指定歌曲生成 AI 樂評；心情推薦能呈現結果；封面生成成功後顯示圖片並可下載；限流時能顯示倒數或資料庫備援文字。可在瀏覽器開發者工具的 Network 檢查請求。

## 5. 故障排除

| 問題 | 處理 |
| --- | --- |
| 網站 404 | 檢查 Pages 分支與 `/docs` 路徑 |
| 無法連線／403 | 核對 `API_BASE`、`ALLOWED_ORIGIN` 與兩邊的部署狀態 |
| `llmReady: false` | 核對 `AI_PROVIDER` 與正式環境的 Secret |
| `imageReady: false` | 確認 Workers AI 和 COVER_LIMITER 綁定 |
| 429 | 確認是 Worker 限流或供應商速率／配額，等待適當重置；前端倒數為保守或供應商提供的等待時間 |
| 502 | 檢查 Worker Logs、模型支援、金鑰及 Workers AI 用量 |
| 新舊功能不同步 | 確認 GitHub Pages、Worker 都完成同一批更新，再強制重新整理 |

配額與模型支援可能變動，請查詢 [Groq Limits](https://console.groq.com/settings/limits)、[Groq Rate Limits](https://console.groq.com/docs/rate-limits) 與 [Workers AI Pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)。公開 API 的 CORS 與 IP 限流不能完全防止濫用；請監控用量，必要時停用服務或撤銷金鑰。
